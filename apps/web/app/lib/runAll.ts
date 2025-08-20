import { computeFifo, type InitialPosition } from "./fifo";
import type { Trade, Position } from "./services/dataService";
import { calcMetrics, debugTodayRealizedBreakdown } from "./metrics";
import { computePeriods } from "./metrics-periods";
import { nyDateStr } from "./time";

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
  _date: string,
  initialPositions: InitialPosition[],
  rawTrades: RawTrade[],
  closePrices: ClosePriceMap,
  input: { dailyResults?: { date: string; realized: number; unrealized: number }[] } = {},
  opts: { evalDate?: Date | string } = {},
) {
  // 优先：调用方显式传入；其次：老环境变量（兼容旧脚本/CI）；最后：系统当前时间
  const envFreeze =
    process?.env?.NEXT_PUBLIC_FREEZE_DATE || process?.env?.FREEZE_DATE;
  const _rawEval = (opts as any)?.evalDate ?? envFreeze;
  const evalDate = _rawEval && _rawEval !== "" ? _rawEval : new Date();
  const evalISO = nyDateStr(evalDate);

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
    const last = closePrices[symbol]?.[evalISO];
    positions.push({
      symbol,
      qty,
      avgPrice,
      last: last ?? avgPrice,
      priceOk: last !== undefined,
    });
  }

  const prevFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
  process.env.NEXT_PUBLIC_FREEZE_DATE = evalISO;
  let metrics;
  let breakdown;
  try {
    metrics = calcMetrics(
      enriched,
      positions,
      input.dailyResults || [],
      initialPositions,
    );
    breakdown = debugTodayRealizedBreakdown(
      enriched,
      evalISO,
      initialPositions,
    );
  } finally {
    if (prevFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = prevFreeze;
    }
  }

  const periods = computePeriods(input.dailyResults || [], evalDate);
  const M9 = periods.M9;
  const M11 = periods.M11;
  const M12 = periods.M12;
  const M13 = periods.M13;
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
    M9,
    M10: { W: metrics.M10.win, L: metrics.M10.loss, winRatePct },
    M11,
    M12,
    M13,
    aux: { breakdown: breakdown.rows },
  };
}

export default runAll;
