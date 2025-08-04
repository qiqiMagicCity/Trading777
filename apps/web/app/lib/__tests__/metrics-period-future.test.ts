import { calcMetrics, type DailyResult } from "@/lib/metrics";

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
      { date: "2024-01-01", realized: 100, float: 10, fifo: 5, M5_1: 0, pnl: 115 },
      { date: "2024-01-02", realized: 200, float: 20, fifo: 10, M5_1: 0, pnl: 230 },
      // Future date that should be ignored
      { date: "2024-01-03", realized: 300, float: 30, fifo: 15, M5_1: 0, pnl: 345 },
    ];

    const metrics = calcMetrics([], [], dailyResults);
    expect(metrics.M11).toBe(345);
    expect(metrics.M12).toBe(345);
    expect(metrics.M13).toBe(345);
  });
});
