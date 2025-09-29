import { runAll } from "../runAll";
import type { RawTrade } from "../runAll";
import type { DailyResult } from "../types";
import { calcMetrics, calcWtdMtdYtdFromSnapshots } from "../metrics";
import * as metricsPeriods from "../metrics-periods";

describe("runAll aligns M11/M12/M13 with snapshot-based WTD/MTD/YTD", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ignores computePeriods overrides for WTD/MTD/YTD", async () => {
    const dailyResults: DailyResult[] = [
      { date: "2025-09-01", realized: 0, unrealized: 95, unrealizedDelta: 0 },
      { date: "2025-09-02", realized: 10, unrealized: 100, unrealizedDelta: 5 },
      { date: "2025-09-04", realized: 0, unrealized: 102, unrealizedDelta: 2 },
    ];
    const evalDate = "2025-09-04";
    const snapshot = calcWtdMtdYtdFromSnapshots(dailyResults, evalDate);
    expect(snapshot.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(Number.isNaN(snapshot.wtd)).toBe(true);
    expect(Number.isNaN(snapshot.mtd)).toBe(true);
    expect(Number.isNaN(snapshot.ytd)).toBe(true);

    const originalCompute = metricsPeriods.computePeriods;
    const basePeriods = originalCompute(dailyResults, evalDate);
    const computeSpy = jest
      .spyOn(metricsPeriods, "computePeriods")
      .mockImplementation((drs, date) => {
        const computed = originalCompute(drs, date);
        return {
          ...computed,
          M9: computed.M9 + 300,
          M11: computed.M11 + 10,
          M12: computed.M12 + 20,
          M13: computed.M13 + 30,
        };
      });

    const result = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults },
      { evalDate },
    );

    expect(computeSpy).toHaveBeenCalledTimes(1);
    expect(result.M9).toBe(basePeriods.M9 + 300);
    expect(Number.isNaN(result.M11)).toBe(true);
    expect(Number.isNaN(result.M12)).toBe(true);
    expect(Number.isNaN(result.M13)).toBe(true);
    expect(result._period?.degraded).toEqual(snapshot.degraded);
    expect(Number.isFinite(basePeriods.M11 + 10)).toBe(true);
    expect(Number.isFinite(basePeriods.M12 + 20)).toBe(true);
    expect(Number.isFinite(basePeriods.M13 + 30)).toBe(true);
  });

  it("propagates period degradation flags from calcMetrics", async () => {
    const evalDate = "2025-10-03";
    const dailyResults: DailyResult[] = [
      { date: evalDate, realized: 8, unrealized: 12, unrealizedDelta: 12 },
    ];

    const metrics = calcMetrics([], [], dailyResults, { tradingDateStr: evalDate });
    expect(metrics._period?.degraded).toEqual({ wtd: true, mtd: true, ytd: true });

    const result = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults },
      { evalDate },
    );

    expect(result._period?.degraded).toEqual(metrics._period?.degraded);
  });
});
