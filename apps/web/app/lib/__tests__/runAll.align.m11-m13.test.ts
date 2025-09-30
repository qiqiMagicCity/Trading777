import { runAll } from "../runAll";
import type { RawTrade } from "../runAll";
import type { DailyResult } from "../types";
import { calcMetrics, calcWtdMtdYtdFromSnapshots } from "../metrics";
import * as metricsPeriods from "../metrics-periods";

describe("runAll aligns M11/M12/M13 with snapshot-based WTD/MTD/YTD", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the same period sums as computePeriods", async () => {
    const dailyResults: DailyResult[] = [
      { date: "2025-09-22", realized: 5, unrealized: 100, unrealizedDelta: 10 },
      { date: "2025-09-23", realized: -2, unrealized: 105, unrealizedDelta: 5 },
      { date: "2025-09-24", realized: 4, unrealized: 110, unrealizedDelta: 5 },
      { date: "2025-09-25", realized: 3, unrealized: 112, unrealizedDelta: 2 },
    ];
    const evalDate = "2025-09-25";

    const basePeriods = metricsPeriods.computePeriods(dailyResults, evalDate);

    const result = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults },
      { evalDate },
    );

    expect(result.M11).toBe(basePeriods.M11);
    expect(result.M12).toBe(basePeriods.M12);
    expect(result.M13).toBe(basePeriods.M13);
    expect(result._period).toBeUndefined();
  });

  it("propagates snapshot totals when computePeriods is modified", async () => {
    const dailyResults: DailyResult[] = [
      { date: "2025-09-22", realized: 5, unrealized: 100, unrealizedDelta: 10 },
      { date: "2025-09-23", realized: 0, unrealized: 110, unrealizedDelta: 10 },
      { date: "2025-09-24", realized: 2, unrealized: 115, unrealizedDelta: 5 },
    ];
    const evalDate = "2025-09-24";

    const snapshot = calcWtdMtdYtdFromSnapshots(dailyResults, evalDate);
    const originalCompute = metricsPeriods.computePeriods;
    const computeSpy = jest
      .spyOn(metricsPeriods, "computePeriods")
      .mockImplementation((drs, date) => {
        const computed = originalCompute(drs, date);
        return {
          ...computed,
          M11: computed.M11 + 99,
          M12: computed.M12 + 99,
          M13: computed.M13 + 99,
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
    expect(result.M11).toBe(snapshot.wtd);
    expect(result.M12).toBe(snapshot.mtd);
    expect(result.M13).toBe(snapshot.ytd);
    expect(result._period).toBeUndefined();
  });

  it("preserves degraded flags from calcMetrics", async () => {
    const evalDate = "2025-10-03";
    const dailyResults: DailyResult[] = [
      { date: evalDate, realized: 8, unrealized: 12, unrealizedDelta: 12 },
    ];

    const metrics = calcMetrics([], [], dailyResults, { tradingDateStr: evalDate });
    expect(metrics._period).toBeUndefined();

    const result = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults },
      { evalDate },
    );

    expect(result._period).toBe(metrics._period);
  });
});
