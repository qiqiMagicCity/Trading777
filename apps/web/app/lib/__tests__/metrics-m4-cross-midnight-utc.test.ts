import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { Trade, Position } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T12:00:00-05:00"),
  };
});

describe("historical PnL across UTC midnight", () => {
  it("counts profit when trades span UTC midnight but same NY day", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 100,
        date: "2024-01-02T01:00:00Z",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 110,
        quantity: 100,
        date: "2024-01-03T00:30:00Z",
        action: "sell",
      },
    ];

    const enriched = computeFifo(trades);
    const positions: Position[] = [];
    const metrics = calcMetrics(enriched, positions);

    expect(metrics.M4).toBe(1000);
    expect(metrics.M5.fifo).toBe(0);
    expect(metrics.M5.trade).toBe(0);
  });
});
