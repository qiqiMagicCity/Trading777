import { computeFifo } from "@/lib/fifo";
import { calcMetrics, type DailyResult } from "@/lib/metrics";
import type { Trade, Position } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics M6 ignores dailyResults pnl", () => {
  it("computes M6 from components rather than dailyResults", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 100,
        date: "2024-01-01",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 110,
        quantity: 100,
        date: "2024-01-02",
        action: "sell",
      },
      {
        symbol: "AAPL",
        price: 100,
        quantity: 50,
        date: "2024-01-02",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 105,
        quantity: 50,
        date: "2024-01-02",
        action: "sell",
      },
    ];

    const enriched = computeFifo(trades);
    const positions: Position[] = [];
    const dailyResults: DailyResult[] = [
      { date: "2024-01-02", realized: 0, float: 0, fifo: 0, M5_1: 0, pnl: 9999 },
    ];

    const metrics = calcMetrics(enriched, positions, dailyResults);
    expect(metrics.M6).toBe(1250);
  });
});
