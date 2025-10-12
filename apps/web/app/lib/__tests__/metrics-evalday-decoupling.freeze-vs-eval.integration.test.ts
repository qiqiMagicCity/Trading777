import { calcMetricsInternal, calcWtdMtdYtdFromSnapshots } from "../metrics";
import type { DailyResult } from "../types";
import { logger } from "../logger";

describe("metrics evalDay decoupling - freeze vs eval", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps WTD/MTD/YTD aligned with periodEvalYmd even when UI freezes previous trade day", () => {
    const daily: DailyResult[] = [
      {
        date: "2024-09-20T16:00:00-04:00",
        realized: 80,
        unrealized: 100,
        unrealizedDelta: 0,
      },
      {
        date: "2024-09-21T10:00:00-04:00",
        realized: 20,
        unrealized: 120,
        unrealizedDelta: 0,
      },
    ];

    const debugSpy = jest.spyOn(logger, "debug").mockImplementation(() => {});

    const metrics = calcMetricsInternal([], [], daily, {
      periodEvalYmd: "2024-09-21",
      tradingDateStr: "2024-09-20",
    });
    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2024-09-21", {
      uiTradeDayYmd: "2024-09-20",
    });

    expect(metrics.M11).toBe(snapshot.wtd);
    expect(metrics.M12).toBe(snapshot.mtd);
    expect(metrics.M13).toBe(snapshot.ytd);

    const wtdDiag = metrics._period?.diagnostics?.wtd;
    expect(wtdDiag?.periodEvalYmd).toBe("2024-09-21");
    expect(wtdDiag?.uiTradeDayYmd).toBe("2024-09-20");
    expect(wtdDiag?.lastSnapshotYmd).toBe("2024-09-21");
    expect(wtdDiag?.filteredRowsCount).toBe(2);
    expect(wtdDiag?.windowStartYmd).toBeDefined();

    expect(debugSpy).toHaveBeenCalledWith(
      "PERIOD_EVAL_DAY_INCLUDED",
      expect.objectContaining({
        periodEvalYmd: "2024-09-21",
        uiTradeDayYmd: "2024-09-20",
        lastSnapshotYmd: "2024-09-21",
      }),
    );
  });
});
