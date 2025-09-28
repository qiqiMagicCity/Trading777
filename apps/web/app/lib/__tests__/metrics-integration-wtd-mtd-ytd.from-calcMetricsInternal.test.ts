import { calcMetricsInternal } from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

const d = (date: string, realized: number, unrealized: number): DailyResult => ({
  date,
  realized,
  unrealized,
});

describe("calcMetricsInternal → M11/M12/M13 with Δ-unrealized", () => {
  it("uses deltas for unrealized within periods", () => {
    const dailyResults: DailyResult[] = [
      d("2025-09-22T21:00:00Z", 100, 50),
      d("2025-09-23T21:00:00Z", -30, 20),
      d("2025-09-24T21:00:00Z", 0, -40),
    ];
    const res = calcMetricsInternal([] as any, [] as any, dailyResults, {
      tradingDateStr: "2025-09-24",
    });
    expect(Number(res.M11.toFixed(2))).toBe(30.0);
    expect(Number(res.M12.toFixed(2))).toBe(30.0);
    expect(Number(res.M13.toFixed(2))).toBe(30.0);
  });
});
