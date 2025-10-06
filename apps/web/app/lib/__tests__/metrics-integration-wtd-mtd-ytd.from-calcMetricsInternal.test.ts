import { calcMetricsInternal } from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

const d = (date: string, realized: number, unrealized: number): DailyResult => ({
  date,
  realized,
  unrealized,
});

describe(
  "calcMetricsInternal → M11/M12/M13 with Δ-unrealized (first-day zero when no baseline)",
  () => {
    it("respects first-day ΔU=0 when no prior snapshot", () => {
      const daily: DailyResult[] = [
        d("2025-09-22T21:00:00Z", 100, 50),
        d("2025-09-23T21:00:00Z", -30, 20),
        d("2025-09-24T21:00:00Z", 0, 0),
      ];
      const res = calcMetricsInternal([] as any, [] as any, daily, {
        tradingDateStr: "2025-09-24",
      });
      expect(Number(res.M11.toFixed(2))).toBe(20.0);
      expect(Number(res.M12.toFixed(2))).toBe(20.0);
      expect(Number(res.M13.toFixed(2))).toBe(20.0);
    });

    it("accepts numeric strings without degrading period totals", () => {
      const daily = [
        { date: "2025-09-22T21:00:00Z", realized: "100", unrealized: "50" },
        { date: "2025-09-23T21:00:00Z", realized: "-30", unrealized: "20" },
        { date: "2025-09-24T21:00:00Z", realized: "0", unrealized: "0" },
      ];
      const res = calcMetricsInternal(
        [] as any,
        [] as any,
        daily as unknown as DailyResult[],
        { tradingDateStr: "2025-09-24" },
      );

      expect(Number(res.M11.toFixed(2))).toBe(20.0);
      expect(Number(res.M12.toFixed(2))).toBe(20.0);
      expect(Number(res.M13.toFixed(2))).toBe(20.0);
      expect(res._period?.diagnostics?.wtd?.parseErrors).toBeUndefined();
    });

    it("propagates parse failures as degraded diagnostics", () => {
      const daily = [
        { date: "2025-09-23T21:00:00Z", realized: "10", unrealized: "100" },
        { date: "2025-09-24T21:00:00Z", realized: "$99", unrealized: "105" },
      ];
      const res = calcMetricsInternal(
        [] as any,
        [] as any,
        daily as unknown as DailyResult[],
        { tradingDateStr: "2025-09-24" },
      );

      expect(res._period?.diagnostics?.wtd?.reason).toBe("DEGEN_PARSE_FAILED");
      expect(res._period?.diagnostics?.wtd?.parseErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: "realized", value: "$99" }),
        ]),
      );
      expect(res._period?.degraded?.wtd).toBe(true);
    });
  },
);
