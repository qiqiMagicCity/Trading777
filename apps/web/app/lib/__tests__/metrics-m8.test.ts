import { calcMetrics } from "@/lib/metrics";
import type { EnrichedTrade } from "@/lib/fifo";

describe("M8 cumulative trade counts", () => {
  it("includes initial positions in totals", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "AAA",
        action: "buy",
        price: 10,
        quantity: 1,
        date: "2024-01-01T09:30:00Z",
        weekday: 2,
        tradeCount: 1,
        amount: 10,
        breakEvenPrice: 10,
        realizedPnl: 0,
        quantityAfter: 1,
        averageCost: 10,
        isInitialPosition: true,
      },
      {
        symbol: "BBB",
        action: "short",
        price: 20,
        quantity: -1,
        date: "2024-01-01T10:30:00Z",
        weekday: 2,
        tradeCount: 1,
        amount: 20,
        breakEvenPrice: 20,
        realizedPnl: 0,
        quantityAfter: -1,
        averageCost: 20,
        isInitialPosition: true,
      },
      {
        symbol: "CCC",
        action: "buy",
        price: 30,
        quantity: 2,
        date: "2024-01-02T09:30:00Z",
        weekday: 3,
        tradeCount: 1,
        amount: 60,
        breakEvenPrice: 30,
        realizedPnl: 0,
        quantityAfter: 2,
        averageCost: 30,
      },
      {
        symbol: "DDD",
        action: "short",
        price: 40,
        quantity: -2,
        date: "2024-01-02T10:30:00Z",
        weekday: 3,
        tradeCount: 1,
        amount: 80,
        breakEvenPrice: 40,
        realizedPnl: 0,
        quantityAfter: -2,
        averageCost: 40,
      },
    ];

    const metrics = calcMetrics(trades, [], []);
    expect(metrics.M8).toEqual({ B: 2, S: 0, P: 2, C: 0, total: 4 });
  });
});
