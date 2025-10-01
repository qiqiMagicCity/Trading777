import {
  calcWtdMtdYtdFromSnapshots,
  explainWtdMtdYtdFromSnapshots,
} from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

type ExtendedDailyResult = DailyResult & {
  missingBaselineSymbols?: string[];
};

const row = (
  date: string,
  realized: number,
  unrealized?: number,
  extra: Partial<ExtendedDailyResult> = {},
): ExtendedDailyResult => ({
  date,
  realized,
  unrealized: unrealized ?? Number.NaN,
  ...extra,
});

describe("WTD partial baseline on Monday start", () => {
  it("marks WTD as partial and keeps realized component", () => {
    const daily: ExtendedDailyResult[] = [
      row("2025-09-26T21:00:00Z", 0, Number.NaN, {
        missingBaselineSymbols: ["tsla", "AAPL "],
      }),
      row("2025-09-29T21:00:00Z", 50, 130),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-29", {
      firstActiveDate: "2025-09-20",
    });

    expect(result.wtd).toBe(50);
    expect(result.degraded.wtd).toBe(false);
    expect(result.status.wtd).toBe("partial");
    expect(result.breakdown.wtd.realized).toBe(50);
    expect(result.breakdown.wtd.unrealizedDelta).toBeUndefined();
    expect(result.breakdown.wtd.baselineDate).toBe("2025-09-26");
    expect(result.breakdown.wtd.missingBaselineSymbols).toEqual([
      "TSLA",
      "AAPL",
    ]);

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-29", {
      firstActiveDate: "2025-09-20",
    });
    expect(explain.status.week).toBe("partial");
    expect(explain.baseline.week.baselineDate).toBe("2025-09-26");
    expect(explain.baseline.week.missingBaselineSymbols).toEqual([
      "TSLA",
      "AAPL",
    ]);
  });
});
