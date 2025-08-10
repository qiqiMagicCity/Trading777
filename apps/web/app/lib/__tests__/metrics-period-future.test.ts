import { calcMetrics } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics period metrics exclude future dates", () => {
  it("excludes daily results after today", () => {
    const dailyResults: DailyResult[] = [
      { date: "2024-01-01", realized: 105, unrealized: 10 },
      { date: "2024-01-02", realized: 210, unrealized: 20 },
      // Future date that should be ignored
      { date: "2024-01-03", realized: 315, unrealized: 30 },
    ];

    const metrics = calcMetrics([], [], dailyResults);
    expect(metrics.M11).toBe(345);
    expect(metrics.M12).toBe(345);
    expect(metrics.M13).toBe(345);
  });
});
