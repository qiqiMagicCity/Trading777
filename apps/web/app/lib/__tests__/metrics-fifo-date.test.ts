import { calcTodayFifoPnL, calcHistoryFifoPnL } from "@/lib/metrics";
import { sortTrades } from "@/lib/sortTrades";
import type { EnrichedTrade } from "@/lib/fifo";

describe("FIFO date validation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("skips malformed and future dates for today's FIFO PnL", () => {
    const trades: EnrichedTrade[] = [
      { symbol: "AAPL", action: "buy", price: 90, quantity: 1, date: "2024-01-02T09:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 110, quantity: 1, date: "2024-01-02T10:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "buy", price: 100, quantity: 1, date: "bad-date" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 120, quantity: 1, date: "2024-01-03T10:00:00Z" } as unknown as EnrichedTrade,
    ];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const pnl = calcTodayFifoPnL(sortTrades(trades), "2024-01-02");
    expect(pnl).toBe(20);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("skips malformed and future dates for historical FIFO PnL", () => {
    const trades: EnrichedTrade[] = [
      { symbol: "AAPL", action: "buy", price: 90, quantity: 1, date: "2024-01-01T10:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 110, quantity: 1, date: "2024-01-02T10:00:00Z" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "buy", price: 100, quantity: 1, date: "bad-date" } as unknown as EnrichedTrade,
      { symbol: "AAPL", action: "sell", price: 120, quantity: 1, date: "2024-01-03T10:00:00Z" } as unknown as EnrichedTrade,
    ];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const pnl = calcHistoryFifoPnL(sortTrades(trades), "2024-01-02");
    expect(pnl).toBe(20);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
