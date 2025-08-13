import { calcMetrics } from "@/lib/metrics";
import type { EnrichedTrade, InitialPosition } from "@/lib/fifo";

describe("M8 cumulative trade counts", () => {
  it("includes initial positions in totals", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "AAA",
        action: "buy",
        price: 10,
        quantity: 1,
        date: "2024-01-01T09:30:00Z",
      } as unknown as EnrichedTrade,
      {
        symbol: "BBB",
        action: "short",
        price: 20,
        quantity: 1,
        date: "2024-01-01T10:30:00Z",
      } as unknown as EnrichedTrade,
    ];

    const initialPositions: InitialPosition[] = [
      { symbol: "CCC", qty: 5, avgPrice: 15 },
      { symbol: "DDD", qty: -3, avgPrice: 25 },
      { symbol: "", qty: 2, avgPrice: 10 },
      { symbol: "EEE", qty: NaN, avgPrice: 8 },
    ];

    const metrics = calcMetrics(trades, [], [], initialPositions);
    expect(metrics.M8).toEqual({ B: 2, S: 0, P: 2, C: 0, total: 4 });
  });
});
