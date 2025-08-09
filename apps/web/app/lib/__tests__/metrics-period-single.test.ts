import { calcMetrics, type DailyResult } from "@/lib/metrics";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2025-08-01T10:00:00-04:00"),
  };
});

describe("calcMetrics period metrics with single day", () => {
  it("computes WTD/MTD/YTD from one daily result", () => {
    const dailyResults: DailyResult[] = [
      {
        date: "2025-08-01",
        realized: 6530,
        float: 1102.5,
        fifo: 1320,
        M5_1: 1670,
        pnl: 8952.5,
      },
    ];

    const metrics = calcMetrics([], [], dailyResults);
    expect(metrics.M11).toBe(8952.5);
    expect(metrics.M12).toBe(8952.5);
    expect(metrics.M13).toBe(8952.5);
  });
});
