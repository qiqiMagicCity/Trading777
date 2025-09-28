import { runAll } from "../runAll";
import type { RawTrade } from "../runAll";
import type { DailyResult } from "../types";
import { calcWtdMtdYtdFromSnapshots } from "../metrics";
import * as metricsPeriods from "../metrics-periods";

describe("runAll aligns M11/M12/M13 with snapshot-based WTD/MTD/YTD", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ignores computePeriods overrides for WTD/MTD/YTD", async () => {
    const dailyResults: DailyResult[] = [
      { date: "2025-09-02", realized: 10, unrealized: 100, unrealizedDelta: 5 },
      { date: "2025-09-04", realized: 0, unrealized: 102, unrealizedDelta: 2 },
    ];
    const evalDate = "2025-09-04";
    const snapshot = calcWtdMtdYtdFromSnapshots(dailyResults, evalDate);
    expect(snapshot).toMatchObject({ wtd: 17, mtd: 17, ytd: 17 });

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
    expect(result.M11).toBeCloseTo(snapshot.wtd, 6);
    expect(result.M12).toBeCloseTo(snapshot.mtd, 6);
    expect(result.M13).toBeCloseTo(snapshot.ytd, 6);
    expect(result.M11).not.toBeCloseTo(basePeriods.M11 + 10);
    expect(result.M12).not.toBeCloseTo(basePeriods.M12 + 20);
    expect(result.M13).not.toBeCloseTo(basePeriods.M13 + 30);
  });
});
