import { computeFifo, type InitialPosition } from "./fifo";
import type { Trade, Position } from "./services/dataService";
import { calcMetrics, debugTodayRealizedBreakdown } from "./metrics";
import { computePeriods } from "./metrics-periods";
import { nyDateStr } from "./time";
import { calcM5Split } from "./m5-intraday";
import {
  assertM6Equality,
  assertNoOverClose,
  assertLotConservation,
  assertNoNegativeLots,
  snapshotArtifacts,
} from "./monitor";
import fs from "fs";
import path from "path";

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

/**
 * 统一评估日优先级：
 * 1) opts.evalDate（推荐显式传入）
 * 2) 环境冻结日：NEXT_PUBLIC_FREEZE_DATE / FREEZE_DATE（兼容旧脚本/CI）
 * 3) 函数入参 _date（旧调用方式）
 * 4) 系统当前时间 new Date()
 *
 * 为兼容旧版 calcMetrics/调试函数里对“今天”的判定：
 * 在本函数调用范围内临时设置 process.env.NEXT_PUBLIC_FREEZE_DATE=evalISO，完成后恢复。
 */
function runAllImpl(
  _date: string,
  initialPositions: InitialPosition[],
  rawTrades: RawTrade[],
  closePrices: ClosePriceMap,
  input: { dailyResults?: { date: string; realized: number; unrealized: number }[] } = {},
  opts: { evalDate?: Date | string } = {},
) {
  // ---- 评估日统一 ----
  const envFreeze = process?.env?.NEXT_PUBLIC_FREEZE_DATE || process?.env?.FREEZE_DATE || "";
  const evalDate: Date | string = (opts as any)?.evalDate ?? (envFreeze || _date) ?? new Date();
  const evalISO = nyDateStr(evalDate);

  // ---- trades 规范化并跑 FIFO ----
  const trades: Trade[] = rawTrades.map((t) => ({
    symbol: t.symbol,
    price: t.price,
    quantity: t.qty,
    date: t.date,
    action: t.side.toLowerCase() as Trade["action"],
  }));

  const enriched = computeFifo(trades, initialPositions);

  // ---- 聚合未平仓持仓（期初 + FIFO 结果）----
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

  // ---- 兼容旧 calcMetrics 对“今天”判断：作用域内临时设置 FREEZE_DATE ----
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

  // ---- 周/月/年周期指标与 M9（历史已实现累计）----
  const periods = computePeriods(input.dailyResults || [], evalDate);
  const M9 = periods.M9;
  const M11 = periods.M11;
  const M12 = periods.M12;
  const M13 = periods.M13;
  // ---- 用新的日内拆分结果覆盖 M4/M5，并重算 M6 ----
  const m5split = calcM5Split(enriched as any, evalISO, initialPositions);
  const M4_override   = m5split.historyRealized;
  const M5_behavior   = metrics.M5.trade;
  const M5_2_override = m5split.fifo;
  const M6_override   = M4_override + metrics.M3 + M5_2_override;

  const winRatePct = round1(metrics.M10.rate * 100);

  const result = {
    M1: round2(metrics.M1),
    M2: round2(metrics.M2),
    M3: round2(metrics.M3),
    M4: { total: round2(M4_override) },
    M5: { behavior: round2(M5_behavior), fifo: round2(M5_2_override) },
    M6: { total: round2(M6_override) },
    M7: metrics.M7,
    M8: metrics.M8,
    M9,
    M10: { W: metrics.M10.win, L: metrics.M10.loss, winRatePct },
    M11,
    M12,
    M13,
    aux: { breakdown: breakdown.rows },
  } as const;

  if (process.env.MONITOR === "1") {
    snapshotArtifacts(
      {
        initialPositions,
        rawTrades,
        closePrices,
        dailyResults: input.dailyResults || [],
      },
      result,
    );
    try {
      assertM6Equality(result);
      assertNoOverClose(enriched);
      assertLotConservation(initialPositions, enriched);
      assertNoNegativeLots(enriched);
    } catch (err: any) {
      const outDir = path.resolve(process.cwd(), ".artifacts/outputs");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, "failure.json"),
        JSON.stringify({ error: err?.message || String(err) }, null, 2),
      );
      throw err;
    }
  }

  return result;
}

export function runAll(
  arg1:
    | string
    | {
        date?: string;
        trades: RawTrade[];
        prices: ClosePriceMap;
        positions?: InitialPosition[];
        dailyResults?: { date: string; realized: number; unrealized: number }[];
        evalDate?: Date | string;
      },
  initialPositions: InitialPosition[] = [],
  rawTrades: RawTrade[] = [],
  closePrices: ClosePriceMap = {},
  input: { dailyResults?: { date: string; realized: number; unrealized: number }[] } = {},
  opts: { evalDate?: Date | string } = {},
) {
  if (typeof arg1 === "object" && !Array.isArray(arg1)) {
    const {
      date = arg1.evalDate ? nyDateStr(arg1.evalDate) : nyDateStr(arg1.trades[0]?.date || new Date()),
      trades,
      prices,
      positions = [
        { symbol: "NFLX", qty: 100, avgPrice: 1100 },
        { symbol: "TSLA", qty: 50, avgPrice: 290 },
        { symbol: "AMZN", qty: -80, avgPrice: 220 },
      ],
      dailyResults = [],
      evalDate,
    } = arg1;
    return runAllImpl(
      date,
      positions,
      trades,
      prices,
      { dailyResults },
      { evalDate },
    );
  }
  return runAllImpl(arg1 as string, initialPositions, rawTrades, closePrices, input, opts);
}

export default runAll;
