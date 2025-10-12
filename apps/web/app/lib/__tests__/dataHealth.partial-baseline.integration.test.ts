import { collectPeriodHealthIssues } from "../../lib/dataHealth";
import type { DailyResult } from "../../lib/types";

const stableMetrics = { M11: 0, M12: 0, M13: 0 } as any;

describe("collectPeriodHealthIssues baseline handling", () => {
  it("skips baseline missing issue when before first active date", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-29", realized: 0, unrealized: 0 },
    ];

    const issues = collectPeriodHealthIssues({
      evalDate: "2025-09-29",
      dailyResults: daily,
      trades: [],
      positions: [],
      metrics: stableMetrics,
    });

    expect(issues).toHaveLength(0);
  });

  it("emits partial ΔU issue when baseline price is missing", () => {
    const daily: Array<DailyResult & { missingBaselineSymbols?: string[] }> = [
      {
        date: "2025-09-26",
        realized: 0,
        unrealized: Number.NaN,
        missingBaselineSymbols: ["abc", "TSLA"],
      },
      { date: "2025-09-29", realized: 20, unrealized: 50 },
    ];

    const issues = collectPeriodHealthIssues({
      evalDate: "2025-09-29",
      dailyResults: daily as DailyResult[],
      trades: [],
      positions: [
        { symbol: "MSFT", qty: 1, avgPrice: 100 } as any,
        { symbol: "TSLA", qty: 2, avgPrice: 200 } as any,
      ],
      metrics: stableMetrics,
    });

    expect(issues.find((item) => item.kind === "BASELINE_DELTA_MISSING")).toEqual({
      kind: "BASELINE_DELTA_MISSING",
      message: "ΔU 缺基线价（2025-09-26, ABC、TSLA）",
    });
  });
});
