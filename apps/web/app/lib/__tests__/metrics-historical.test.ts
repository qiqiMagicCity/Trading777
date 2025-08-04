import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { Trade, Position } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics with historical positions", () => {
  it("matches expected M1-M5 values", () => {
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
        quantity: 50,
        date: "2024-01-02",
        action: "sell",
      },
      {
        symbol: "AAPL",
        price: 105,
        quantity: 20,
        date: "2024-01-02",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 108,
        quantity: 20,
        date: "2024-01-02",
        action: "sell",
      },
    ];

    const enriched = computeFifo(trades);
    const last = enriched[enriched.length - 1]!;
    const positions: Position[] = [
      {
        symbol: "AAPL",
        qty: last.quantityAfter,
        avgPrice: last.averageCost,
        last: 110,
        priceOk: true,
      },
    ];

    const metrics = calcMetrics(enriched, positions);
    expect(metrics.M1).toBe(5100);
    expect(metrics.M2).toBe(5500);
    expect(metrics.M3).toBe(400);
    expect(metrics.M4).toBe(660);
    expect(metrics.M5.trade).toBe(60);
    expect(metrics.M5.fifo).toBe(0);
  });
});
