import {
  buildTradeBasedIntradayFloatingBreakdown,
  buildTradeBasedIntradayFloatingContext,
  calculateTradeBasedIntradayFloatingEntry,
} from "../../modules/positionMetrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("trade-based intraday floating PnL", () => {
  const todayStr = "2024-01-02";

  const basePosition: Position = {
    symbol: "TEST",
    qty: 0,
    avgPrice: 180,
    last: 182,
    priceOk: true,
    prevClose: 180,
  } as Position;

  function trade(partial: Partial<EnrichedTrade>): EnrichedTrade {
    return {
      symbol: "TEST",
      action: "buy",
      price: 180,
      quantity: 1,
      date: `${todayStr}T14:00:00Z`,
      ...partial,
    } as unknown as EnrichedTrade;
  }

  it("computes overnight and intraday buckets for long carry with new buys", () => {
    const trades: EnrichedTrade[] = [
      trade({ action: "buy", price: 180, quantity: 10 }),
      trade({ action: "buy", price: 182, quantity: 20, date: `${todayStr}T15:00:00Z` }),
    ];

    const positions: Position[] = [
      { ...basePosition, qty: 130, prevClose: 180, last: 182 },
    ];

    const dataset = buildTradeBasedIntradayFloatingBreakdown({
      trades,
      positions,
      todayStr,
    });

    const entry = dataset.values.get("TEST");
    expect(entry).toBeDefined();
    expect(entry?.qOvernight).toBeCloseTo(100);
    expect(entry?.avgTodayLong).toBeCloseTo(181.3333, 4);
    expect(entry?.overnight).toBeCloseTo(200, 4);
    expect(entry?.intradayOpen).toBeCloseTo(20.001, 4);
    expect(entry?.floating).toBeCloseTo(220.001, 4);
  });

  it("sets overnight to zero when flipping direction intraday", () => {
    const trades: EnrichedTrade[] = [
      trade({ action: "sell", price: 181, quantity: 150 }),
    ];

    const positions: Position[] = [
      { ...basePosition, qty: -50, prevClose: 180, last: 182 },
    ];

    const dataset = buildTradeBasedIntradayFloatingBreakdown({
      trades,
      positions,
      todayStr,
    });

    const entry = dataset.values.get("TEST");
    expect(entry).toBeDefined();
    expect(entry?.qOvernight).toBe(0);
    expect(entry?.avgTodayShort).toBeCloseTo(181, 4);
    expect(entry?.overnight).toBe(0);
    expect(entry?.intradayOpen).toBeCloseTo(-50, 4);
    expect(entry?.floating).toBeCloseTo(-50, 4);
  });

  it("handles partial close with new intraday longs", () => {
    const trades: EnrichedTrade[] = [
      trade({ action: "sell", price: 180, quantity: 70 }),
      trade({ action: "buy", price: 181, quantity: 50, date: `${todayStr}T16:00:00Z` }),
    ];

    const positions: Position[] = [
      { ...basePosition, qty: 80, prevClose: 180, last: 182 },
    ];

    const dataset = buildTradeBasedIntradayFloatingBreakdown({
      trades,
      positions,
      todayStr,
    });

    const entry = dataset.values.get("TEST");
    expect(entry).toBeDefined();
    expect(entry?.qOvernight).toBeCloseTo(30, 4);
    expect(entry?.avgTodayLong).toBeCloseTo(181, 4);
    expect(entry?.overnight).toBeCloseTo(60, 4);
    expect(entry?.intradayOpen).toBeCloseTo(50, 4);
    expect(entry?.floating).toBeCloseTo(110, 4);
  });

  it("marks missing prev close and zeros overnight contribution", () => {
    const trades: EnrichedTrade[] = [
      trade({ action: "buy", price: 180, quantity: 10 }),
    ];

    const positions: Position[] = [
      { ...basePosition, qty: 10, prevClose: undefined, last: 182 },
    ];

    const dataset = buildTradeBasedIntradayFloatingBreakdown({
      trades,
      positions,
      todayStr,
    });

    const entry = dataset.values.get("TEST");
    expect(entry).toBeDefined();
    expect(entry?.missingPrevClose).toBeUndefined();
    expect(entry?.overnight).toBe(0);
    expect(entry?.intradayOpen).toBeCloseTo(20, 4);
  });

  it("computes per-position entry via context for realtime prices", () => {
    const trades: EnrichedTrade[] = [
      trade({ action: "buy", price: 180, quantity: 20 }),
    ];

    const positions: Position[] = [
      { ...basePosition, qty: 20, prevClose: 179.5, last: 181.2 },
    ];

    const context = buildTradeBasedIntradayFloatingContext({
      trades,
      positions,
      todayStr,
    });

    const entry = calculateTradeBasedIntradayFloatingEntry(context, {
      symbol: "TEST",
      qty: 20,
      mark: 181.75,
      prevClose: 179.5,
    });

    expect(entry).toBeDefined();
    expect(entry?.mark).toBeCloseTo(181.75, 4);
    expect(entry?.avgTodayLong).toBeCloseTo(180, 4);
    expect(entry?.intradayOpen).toBeCloseTo(35, 4);
    expect(entry?.floating).toBeCloseTo(35, 4);
  });
});
