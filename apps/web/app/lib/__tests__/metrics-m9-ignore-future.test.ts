import { calcMetrics } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics M9 ignores future dailyResults", () => {
  it("excludes future daily results from M9", () => {
    const dailyResults: DailyResult[] = [
      { date: "2024-01-01", realized: 110, unrealized: 0 },
      { date: "2024-01-02", realized: 220, unrealized: 0 },
      // Future date that should be ignored
      { date: "2024-01-03", realized: 330, unrealized: 0 },
    ];

    const metrics = calcMetrics([], [], dailyResults);
    expect(metrics.M9).toBe(330);
  });
});
