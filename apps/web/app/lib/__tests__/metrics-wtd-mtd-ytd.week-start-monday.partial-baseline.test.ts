import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

describe("WTD partial baseline when previous Friday lacks MTM", () => {
  it("marks WTD as partial and keeps realized component", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-26", realized: 2, unrealized: Number.NaN },
      { date: "2025-09-29", realized: 5, unrealized: 10 },
      { date: "2025-09-30", realized: 3, unrealized: 18 },
    ];

    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2025-09-30");

    expect(snapshot.wtd).toBe(8);
    expect(snapshot.degraded.wtd).toBe(false);
    expect(snapshot.baseline.wtd.status).toBe("partial");
    expect(snapshot.baseline.wtd.baselineMode).toBe("partial");
    expect(snapshot.baseline.wtd.baselineDate).toBe("2025-09-26");
    expect(snapshot.baseline.wtd.realized).toBe(8);
    expect(snapshot.baseline.wtd.unrealizedDelta).toBeNull();
  });
});
