import { calcMetricsInternal, calcWtdMtdYtdFromSnapshots } from "../metrics";
import type { DailyResult } from "../types";

describe("metrics evalDay decoupling - after hours", () => {
  it("uses the latest same-day snapshot even when UI rolls back to previous trading day", () => {
    const daily: DailyResult[] = [
      {
        date: "2024-09-17T16:00:00-04:00",
        realized: 30,
        unrealized: 80,
        unrealizedDelta: 0,
      },
      {
        date: "2024-09-18T16:00:00-04:00",
        realized: 10,
        unrealized: 90,
        unrealizedDelta: 0,
      },
      {
        date: "2024-09-18T20:30:00-04:00",
        realized: 15,
        unrealized: 95,
        unrealizedDelta: 0,
      },
    ];

    const metrics = calcMetricsInternal([], [], daily, {
      periodEvalYmd: "2024-09-18",
      tradingDateStr: "2024-09-17",
    });
    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2024-09-18", {
      uiTradeDayYmd: "2024-09-17",
    });

    expect(metrics.M11).toBe(snapshot.wtd);
    expect(metrics.M12).toBe(snapshot.mtd);
    expect(metrics.M13).toBe(snapshot.ytd);

    const diag = metrics._period?.diagnostics?.wtd;
    expect(diag?.lastSnapshotYmd).toBe("2024-09-18");
    expect(diag?.filteredRowsCount).toBe(2);
    expect(diag?.periodEvalYmd).toBe("2024-09-18");
    expect(diag?.uiTradeDayYmd).toBe("2024-09-17");
  });
});
