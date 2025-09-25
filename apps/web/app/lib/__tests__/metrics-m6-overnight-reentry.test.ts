import { calcMetrics } from "../metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("M6 overnight leg", () => {
  it("excludes intraday re-entry from overnight MTM", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "AAA",
        action: "buy",
        quantity: 100,
        price: 100,
        date: "2024-09-23",
        time: "2024-09-23T14:30:00Z",
        isInitialPosition: true,
      } as any,
      {
        symbol: "AAA",
        action: "sell",
        quantity: 100,
        price: 103,
        date: "2024-09-24",
        time: "2024-09-24T14:35:00Z",
      } as any,
      {
        symbol: "AAA",
        action: "buy",
        quantity: 100,
        price: 104,
        date: "2024-09-24",
        time: "2024-09-24T18:35:00Z",
      } as any,
    ];

    const positions: Position[] = [
      {
        symbol: "AAA",
        qty: 100,
        avgPrice: 104,
        last: 105,
        prevClose: 100,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, positions as any, []);

    expect(metrics.M4).toBeCloseTo(300, 10);
    expect(metrics.aux?.m6PriceChange).toBeDefined();
    expect(metrics.aux?.m6PriceChange).toBeCloseTo(0, 10);
    expect(metrics.M6).toBeCloseTo(metrics.M4 + metrics.M5.fifo, 10);
  });
});
