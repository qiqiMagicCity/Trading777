import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";
import type { Trade } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics M9 falls back to trades when dailyResults are future only", () => {
  it("uses trade realized pnl if all daily results are in the future", () => {
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
    ];

    const enriched = computeFifo(trades);
    const dailyResults: DailyResult[] = [
      {
        date: "2024-01-03",
        realized: 1000,
        unrealized: 0,
      },
    ];

    const metrics = calcMetrics(enriched, [], dailyResults);
    expect(metrics.M9).toBe(0);
  });
});
