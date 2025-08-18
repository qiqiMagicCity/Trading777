import { calcTodayFifoPnL, calcHistoryFifoPnL } from "@/lib/metrics";
import { sortTrades } from "@/lib/sortTrades";
import type { EnrichedTrade } from "@/lib/fifo";

describe("FIFO multi-day scenarios", () => {
  it("handles mixed historical and same-day trades with partial closures", () => {
    const trades: EnrichedTrade[] = [
      { symbol: "AAPL", action: "buy", price: 90, quantity: 100, date: "2024-01-01T10:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "buy", price: 95, quantity: 50, date: "2024-01-02T09:30:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 105, quantity: 30, date: "2024-01-02T10:30:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 100, quantity: 60, date: "2024-01-02T11:00:00Z" } as unknown as EnrichedTrade,
    ];
    const sorted = sortTrades(trades);
    const today = "2024-01-02";
    expect(calcTodayFifoPnL(sorted, today)).toBe(400);
    expect(calcHistoryFifoPnL(sorted, today)).toBe(400);
  });
});
