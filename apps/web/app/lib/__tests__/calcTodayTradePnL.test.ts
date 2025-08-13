import { calcTodayTradePnL } from "@/lib/calcTodayTradePnL";
import type { EnrichedTrade } from "@/lib/fifo";

describe("calcTodayTradePnL sorting", () => {
  it("processes identical timestamps in original order", () => {
    const trades: EnrichedTrade[] = [
      { symbol: "T", action: "sell", price: 110, quantity: 1, date: "2024-08-20T10:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "T", action: "buy", price: 100, quantity: 1, date: "2024-08-20T10:00:00Z" } as unknown as EnrichedTrade,
    ];
    const pnl = calcTodayTradePnL(trades, "2024-08-20");
    expect(pnl).toBe(0);
  });

  it("ignores malformed dates without throwing", () => {
    const trades: EnrichedTrade[] = [
      { symbol: "T", action: "sell", price: 110, quantity: 1, date: "bad-date" } as unknown as EnrichedTrade,
      { symbol: "T", action: "buy", price: 100, quantity: 1, date: "2024-08-20T09:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "T", action: "sell", price: 110, quantity: 1, date: "2024-08-20T10:00:00Z" } as unknown as EnrichedTrade,
    ];
    expect(() => calcTodayTradePnL(trades, "2024-08-20")).not.toThrow();
    const pnl = calcTodayTradePnL(trades, "2024-08-20");
    expect(pnl).toBe(10);
  });
});

