import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { Trade, Position } from "@/lib/services/dataService";

// Mock timezone to control today's date
jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T17:00:00-05:00"),
  };
});

describe("M5 FIFO with timestamped trades", () => {
  it("handles same-day trades with timestamps", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 10,
        date: "2024-01-02T09:30:00-05:00",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 110,
        quantity: 10,
        date: "2024-01-02T14:30:00-05:00",
        action: "sell",
      },
    ];

    const enriched = computeFifo(trades);
    const positions: Position[] = [];
    const metrics = calcMetrics(enriched, positions);

    // Both trades occur on the mocked "today" date, so FIFO profit should be recognized
    expect(metrics.M5.fifo).toBe(100);
    expect(metrics.M5.trade).toBe(100);
  });
});
