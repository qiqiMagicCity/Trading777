import { calcMetricsInternal } from "../../lib/metrics";
import { calcTodayTradePnL } from "../../lib/calcTodayTradePnL";
import { sortTrades } from "../../lib/sortTrades";
import type { EnrichedTrade } from "../../lib/fifo";
import type { Position } from "../../lib/services/dataService";

describe("overnight short trades stay in overnight bucket", () => {
  it("keeps prior-day late short in overnight PnL on next day", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "INTC",
        action: "short",
        price: 36.9,
        quantity: -7,
        date: "2025-01-14T20:30:00-05:00",
      } as unknown as EnrichedTrade,
    ];

    const positions: Position[] = [
      {
        symbol: "INTC",
        qty: -7,
        avgPrice: 36.9,
        last: 36.83,
        priceOk: true,
        prevClose: 36.9,
      },
    ];

    const metrics = calcMetricsInternal(trades, positions, [], {
      tradingDateStr: "2025-01-15",
    });

    expect(metrics.M5.trade).toBe(0);
    expect(metrics.M7.total).toBe(0);
    expect(metrics._m6?.mtmOvernight).toBeCloseTo((36.9 - 36.83) * 7, 5);

    const intraday = calcTodayTradePnL(sortTrades(trades), "2025-01-15");
    expect(intraday).toBe(0);
  });
});
