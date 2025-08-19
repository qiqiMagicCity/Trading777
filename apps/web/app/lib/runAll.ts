import { computeFifo, type InitialPosition } from "./fifo";
import type { Trade, Position } from "./services/dataService";
import { calcMetrics, debugTodayRealizedBreakdown } from "./metrics";

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export type RawTrade = {
  date: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  symbol: string;
  qty: number;
  price: number;
};

export type ClosePriceMap = Record<string, Record<string, number>>; // symbol -> { date: price }

export function runAll(
  date: string,
  initialPositions: InitialPosition[],
  rawTrades: RawTrade[],
  closePrices: ClosePriceMap,
) {
  const prevFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
  process.env.NEXT_PUBLIC_FREEZE_DATE = date;
  try {
    const trades: Trade[] = rawTrades.map((t) => ({
      symbol: t.symbol,
      price: t.price,
      quantity: t.qty,
      date: t.date,
      action: t.side.toLowerCase() as Trade["action"],
    }));

    const enriched = computeFifo(trades, initialPositions);

    const posMap = new Map<string, { qty: number; avgPrice: number }>();
    for (const p of initialPositions) {
      posMap.set(p.symbol, { qty: p.qty, avgPrice: p.avgPrice });
    }
    for (const t of enriched) {
      posMap.set(t.symbol, {
        qty: t.quantityAfter,
        avgPrice: t.averageCost,
      });
    }

    const positions: Position[] = [];
    for (const [symbol, { qty, avgPrice }] of posMap.entries()) {
      if (!qty) continue;
      const last = closePrices[symbol]?.[date];
      positions.push({
        symbol,
        qty,
        avgPrice,
        last: last ?? avgPrice,
        priceOk: last !== undefined,
      });
    }

    const metrics = calcMetrics(enriched, positions, [], initialPositions);
    const breakdown = debugTodayRealizedBreakdown(
      enriched,
      date,
      initialPositions,
    );

    const m9 = round2(metrics.M4 + metrics.M5.fifo);
    const winRatePct = round1(metrics.M10.rate * 100);

    return {
      M1: round2(metrics.M1),
      M2: round2(metrics.M2),
      M3: round2(metrics.M3),
      M4: round2(metrics.M4),
      M5_1: round2(metrics.M5.trade),
      M5_2: round2(metrics.M5.fifo),
      M6: round2(metrics.M6),
      M7: metrics.M7,
      M8: metrics.M8,
      M9: m9,
      M10: { W: metrics.M10.win, L: metrics.M10.loss, winRatePct },
      M11: round2(metrics.M6),
      M12: round2(metrics.M6),
      M13: round2(metrics.M6),
      aux: { breakdown: breakdown.rows },
    };
  } finally {
    if (prevFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = prevFreeze;
    }
  }
}

export default runAll;
