import { computeFifo, type EnrichedTrade } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { Trade } from "@/lib/services/dataService";

describe("FIFO handling of invalid dates", () => {
  it("orders malformed or missing dates last without throwing", () => {
    const trades: Trade[] = [
      { symbol: "U", price: 1, quantity: 1, date: undefined as any, action: "buy" },
      { symbol: "E", price: 1, quantity: 1, date: "" as any, action: "buy" },
      { symbol: "M", price: 1, quantity: 1, date: "bad-date", action: "buy" },
      { symbol: "V1", price: 1, quantity: 1, date: "2024-01-01", action: "buy" },
      { symbol: "V2", price: 1, quantity: 1, date: "2024-01-02", action: "buy" },
    ];

    let enriched: EnrichedTrade[] | undefined;
    expect(() => {
      enriched = computeFifo(trades);
      calcMetrics(enriched, []);
    }).not.toThrow();

    const order = enriched!.map((t) => t.symbol);
    expect(order).toEqual(["V1", "V2", "U", "E", "M"]);
  });
});
