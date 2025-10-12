import { calcMetricsInternal, calcWtdMtdYtdFromSnapshots } from "../metrics";
import type { DailyResult } from "../types";

describe("metrics evalDay decoupling - holiday & DST", () => {
  it("includes holiday snapshots when available", () => {
    const daily: DailyResult[] = [
      {
        date: "2024-07-03T16:00:00-04:00",
        realized: 50,
        unrealized: 100,
        unrealizedDelta: 0,
      },
      {
        date: "2024-07-04T10:00:00-04:00",
        realized: 5,
        unrealized: 110,
        unrealizedDelta: 0,
      },
    ];

    const metrics = calcMetricsInternal([], [], daily, {
      periodEvalYmd: "2024-07-04",
      tradingDateStr: "2024-07-03",
    });
    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2024-07-04", {
      uiTradeDayYmd: "2024-07-03",
    });

    expect(metrics.M11).toBe(snapshot.wtd);
    expect(metrics._period?.diagnostics?.wtd?.lastSnapshotYmd).toBe("2024-07-04");
    expect(metrics._period?.diagnostics?.wtd?.uiTradeDayYmd).toBe("2024-07-03");
  });

  it("remains stable when holiday snapshot is absent", () => {
    const daily: DailyResult[] = [
      {
        date: "2024-07-03T16:00:00-04:00",
        realized: 60,
        unrealized: 95,
        unrealizedDelta: 0,
      },
    ];

    const metrics = calcMetricsInternal([], [], daily, {
      periodEvalYmd: "2024-07-04",
      tradingDateStr: "2024-07-03",
    });
    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2024-07-04", {
      uiTradeDayYmd: "2024-07-03",
    });

    expect(metrics.M11).toBe(snapshot.wtd);
    expect(metrics._period?.diagnostics?.wtd?.lastSnapshotYmd).toBe("2024-07-03");
    expect(metrics._period?.diagnostics?.wtd?.filteredRowsCount).toBe(1);
  });

  it("handles DST boundaries without shifting window start", () => {
    const daily: DailyResult[] = [
      {
        date: "2024-03-08T16:00:00-05:00",
        realized: 40,
        unrealized: 90,
        unrealizedDelta: 0,
      },
      {
        date: "2024-03-09T10:00:00-05:00",
        realized: 5,
        unrealized: 92,
        unrealizedDelta: 0,
      },
      {
        date: "2024-03-10T10:00:00-04:00",
        realized: 7,
        unrealized: 95,
        unrealizedDelta: 0,
      },
    ];

    const metrics = calcMetricsInternal([], [], daily, {
      periodEvalYmd: "2024-03-10",
      tradingDateStr: "2024-03-08",
    });
    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2024-03-10", {
      uiTradeDayYmd: "2024-03-08",
    });

    expect(metrics.M11).toBe(snapshot.wtd);
    expect(metrics._period?.diagnostics?.wtd?.periodEvalYmd).toBe("2024-03-10");
    expect(metrics._period?.diagnostics?.wtd?.windowStartYmd).toBe("2024-03-04");
  });
});
