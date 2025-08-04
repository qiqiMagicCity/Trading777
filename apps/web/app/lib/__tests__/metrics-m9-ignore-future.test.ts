import { calcMetrics, type DailyResult } from "@/lib/metrics";

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
      { date: "2024-01-01", realized: 100, float: 0, fifo: 10, M5_1: 0, pnl: 110 },
      { date: "2024-01-02", realized: 200, float: 0, fifo: 20, M5_1: 0, pnl: 220 },
      // Future date that should be ignored
      { date: "2024-01-03", realized: 300, float: 0, fifo: 30, M5_1: 0, pnl: 330 },
    ];

    const metrics = calcMetrics([], [], dailyResults);
    expect(metrics.M9).toBe(330);
  });
});
