import type { InitialPosition } from "./fifo";
import type { Trade, Position } from "./services/dataService";
import { calcMetrics } from "./metrics";
import { computePeriods } from "./metrics-periods";
import { nyDateStr } from "./time";
import {
  assertM6Equality,
  assertNoOverClose,
  assertLotConservation,
  assertNoNegativeLots,
  snapshotArtifacts,
} from "./monitor";
import { realizedPnLLong, realizedPnLShort } from "./money";
import { buildEnrichedTrades, replayPortfolio } from "./tradeReplay";
import fs from "fs";
import path from "path";
import { readPublicJson } from "./io/readPublicJson";
import { assertSchema } from "./schemas/assertSchema";
import { Trades, Positions, PriceMap, DailyResults } from "./schemas/real";

// 统一解析 public 文件路径
function resolvePublicFile(relName: string): string | null {
  const candidates = [
    path.join(process.cwd(), "apps/web/public", relName),
    path.join(process.cwd(), "public", relName),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

async function readJsonSafe<T>(relName: string, fallback: T): Promise<T> {
  return readPublicJson(relName, fallback);
}

/**
 * 从 public 中的 prices.json 与 trades.json 读取日期集合，
 * 与传入区间取交集并去重排序。
 *
 * @param from 起始日期（含）
 * @param to   结束日期（含）
 * @param tradesOpt 可选：直接传入的原始成交数组，测试用
 * @param pricesOpt 可选：直接传入的收盘价映射，测试用
 */
export function getReplayDays(
  from: string,
  to: string,
  tradesOpt?: RawTrade[],
  pricesOpt?: any,
): string[] {
  const trades = tradesOpt ?? [];
  const prices = normalizeClosePriceMap(
    pricesOpt ?? {},
  );
  const within = (d: string) => (!from || d >= from) && (!to || d <= to);
  const set = new Set<string>();
  for (const sym of Object.keys(prices)) {
    const byDate = prices[sym] || {};
    for (const d of Object.keys(byDate)) {
      if (within(d)) set.add(d);
    }
  }
  for (const t of trades) {
    const d = nyDateStr(t.date);
    if (within(d)) set.add(d);
  }
  return Array.from(set).sort();
}

export async function runAll(...args: any[]) {
  if (args.length === 1 && typeof args[0] === "object" && Array.isArray((args[0] as any).symbols)) {
    const { from } = args[0] as { symbols: string[]; from: string; to: string };
    const trades = assertSchema(await readJsonSafe("trades.json", [] as RawTrade[]), Trades) as RawTrade[];
    const positions = assertSchema(await readJsonSafe("positions.json", [] as InitialPosition[]), Positions);
    const pricesMap = await readJsonSafe("prices.json", {} as any);
    const prices = normalizeClosePriceMap(assertSchema(pricesMap, PriceMap));
    const daily = assertSchema(await readJsonSafe("dailyResult.json", [] as any[]), DailyResults);
    return runAllCore(from, positions, trades, prices, { dailyResults: daily }, { evalDate: from });
  }
  return runAllCore.apply(null, args as any);
}

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

export function normalizeClosePriceMap(input: any): ClosePriceMap {
  const out: ClosePriceMap = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      const date = k;
      const mp = v as Record<string, number>;
      for (const [sym, price] of Object.entries(mp)) {
        (out[sym] ??= {})[date] = Number(price);
      }
    } else {
      out[k] = v as Record<string, number>;
    }
  }
  return out;
}

// --- M5/M4 计算核心工具 ---
type Lot = { qty: number; cost: number; isToday: boolean; openPrice: number; time: string };
type ConsumeRow = { qty: number; cost: number; isToday: boolean; openPrice: number; time: string };
type SymState = {
  longLots: Lot[]; // BUY 队列（含历史 + 当日）
  shortLots: Lot[]; // SHORT 队列（含历史 + 当日）
  behLong: Lot[]; // 当日 BUY 行为栈
  behShort: Lot[]; // 当日 SHORT 行为栈
};

function computeBaselineDate(rawTrades: RawTrade[], fallbackISO: string): string {
  let minTime = Number.POSITIVE_INFINITY;
  for (const t of rawTrades) {
    const time = new Date(t.date).getTime();
    if (Number.isFinite(time) && time < minTime) {
      minTime = time;
    }
  }
  if (!Number.isFinite(minTime)) {
    const fallback = new Date(`${fallbackISO}T00:00:00Z`);
    fallback.setUTCDate(fallback.getUTCDate() - 1);
    return fallback.toISOString().slice(0, 10);
  }
  const base = new Date(minTime);
  base.setUTCDate(base.getUTCDate() - 1);
  return base.toISOString().slice(0, 10);
}

function fifoPreview(lots: Lot[], qty: number): ConsumeRow[] {
  const rows: ConsumeRow[] = [];
  let need = qty;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(need, lot.qty);
    if (take > 0)
      rows.push({ qty: take, cost: lot.cost, isToday: lot.isToday, openPrice: lot.openPrice, time: lot.time });
    need -= take;
  }
  return rows;
}

function fifoApply(lots: Lot[], preview: ConsumeRow[]): void {
  let i = 0,
    j = 0;
  const wants = preview.map((r) => ({ ...r }));
  while (i < lots.length && j < wants.length) {
    const want = wants[j]!;
    if (want.qty <= 0) {
      j++;
      continue;
    }
    const lot = lots[i]!;
    const can = Math.min(lot.qty, want.qty);
    lot.qty -= can;
    want.qty -= can;
    if (lot.qty === 0) {
      lots.splice(i, 1);
    } else {
      i++;
    }
    if (want.qty === 0) j++;
  }
}

function behAvail(stack: Lot[]): number {
  return stack.reduce((s, x) => s + x.qty, 0);
}

function behConsume(stack: Lot[], qty: number): ConsumeRow[] {
  const rows: ConsumeRow[] = [];
  let need = qty;
  for (let i = 0; i < stack.length && need > 0; i++) {
    const lot = stack[i]!;
    const take = Math.min(need, lot.qty);
    if (take > 0) {
      rows.push({ qty: take, cost: lot.cost, isToday: true, openPrice: lot.openPrice, time: lot.time });
      lot.qty -= take;
      need -= take;
    }
    if (lot.qty === 0) {
      stack.splice(i, 1);
      i--;
    }
  }
  return rows;
}

function takeQty(rows: ConsumeRow[], need: number): ConsumeRow[] {
  const out: ConsumeRow[] = [];
  let left = need;
  for (const r of rows) {
    if (left <= 0) break;
    const t = Math.min(left, r.qty);
    if (t > 0) out.push({ ...r, qty: t });
    left -= t;
  }
  return out;
}

let bySym: Record<string, SymState> = {};
function getSym(sym: string): SymState {
  return bySym[sym] ?? (bySym[sym] = { longLots: [], shortLots: [], behLong: [], behShort: [] });
}

let breakdown: any[] = [];
let M4_total = 0,
  M51 = 0,
  M52 = 0;

function postM4_Long(qty: number, sellPrice: number, cost: number, sym: string, time: string) {
  const pnl = realizedPnLLong(sellPrice, cost, qty);
  M4_total += pnl;
  breakdown.push({ symbol: sym, time, action: 'SELL', into: 'M4', qty, closePrice: sellPrice, fifoCost: cost, lotTag: 'H' });
}

function postM4_Short(qty: number, coverPrice: number, cost: number, sym: string, time: string) {
  const pnl = realizedPnLShort(cost, coverPrice, qty);
  M4_total += pnl;
  breakdown.push({ symbol: sym, time, action: 'COVER', into: 'M4', qty, closePrice: coverPrice, fifoCost: cost, lotTag: 'H' });
}

function postM5_Long(todayLots: ConsumeRow[], fifoRows: ConsumeRow[], sellPrice: number, sym: string, time: string) {
  for (const r of todayLots) {
    const pnl = realizedPnLLong(sellPrice, r.openPrice, r.qty);
    M51 += pnl;
    breakdown.push({ symbol: sym, time, action: 'SELL', into: 'M5.1', qty: r.qty, closePrice: sellPrice, openPrice: r.openPrice, lotTag: 'T' });
  }
  const fifoToday = takeQty(
    fifoRows.filter((x) => x.isToday),
    todayLots.reduce((s, x) => s + x.qty, 0),
  );
  for (const r of fifoToday) {
    const pnl = realizedPnLLong(sellPrice, r.cost, r.qty);
    M52 += pnl;
    breakdown.push({ symbol: sym, time, action: 'SELL', into: 'M5.2', qty: r.qty, closePrice: sellPrice, fifoCost: r.cost, lotTag: 'T' });
  }
}

function postM5_Short(todayLots: ConsumeRow[], fifoRows: ConsumeRow[], coverPrice: number, sym: string, time: string) {
  for (const r of todayLots) {
    const pnl = realizedPnLShort(r.openPrice, coverPrice, r.qty);
    M51 += pnl;
    breakdown.push({ symbol: sym, time, action: 'COVER', into: 'M5.1', qty: r.qty, closePrice: coverPrice, openPrice: r.openPrice, lotTag: 'T' });
  }
  const fifoToday = takeQty(
    fifoRows.filter((x) => x.isToday),
    todayLots.reduce((s, x) => s + x.qty, 0),
  );
  for (const r of fifoToday) {
    const pnl = realizedPnLShort(r.cost, coverPrice, r.qty);
    M52 += pnl;
    breakdown.push({ symbol: sym, time, action: 'COVER', into: 'M5.2', qty: r.qty, closePrice: coverPrice, fifoCost: r.cost, lotTag: 'T' });
  }
}

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
function runAllCore(
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

  // ---- trades 规范化并通过交易回放构建基线 ----
  const trades: Trade[] = rawTrades.map((t) => ({
    symbol: t.symbol,
    price: t.price,
    quantity: t.qty,
    date: t.date,
    action: t.side.toLowerCase() as Trade["action"],
  }));

  const baselineDate = computeBaselineDate(rawTrades, evalISO);
  const baselineTrades: Trade[] = [];
  for (const pos of initialPositions) {
    if (!pos.symbol || !Number.isFinite(pos.qty) || pos.qty === 0) continue;
    const qtyAbs = Math.abs(pos.qty);
    const isShort = pos.qty < 0;
    baselineTrades.push({
      symbol: pos.symbol,
      price: pos.avgPrice,
      quantity: isShort ? -qtyAbs : qtyAbs,
      date: `${baselineDate}T00:00:00Z`,
      action: isShort ? "short" : "buy",
      isInitialPosition: true,
    });
  }

  const replay = replayPortfolio([...baselineTrades, ...trades]);
  const enriched = buildEnrichedTrades(replay.baseline);
  const baselinePositions = replay.baseline.initialPositions;

  const positions: Position[] = replay.positions.map((pos) => {
    const last = closePrices[pos.symbol]?.[evalISO];
    return {
      ...pos,
      last: last ?? pos.avgPrice,
      priceOk: last !== undefined,
    };
  });

  // ---- 兼容旧 calcMetrics 对“今天”判断：作用域内临时设置 FREEZE_DATE ----
  const prevFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
  process.env.NEXT_PUBLIC_FREEZE_DATE = evalISO;

  let metrics;
  try {
    metrics = calcMetrics(enriched, positions, input.dailyResults || []);
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
  // ---- 用新的日内拆分算法计算 M4/M5，并重算 M6 ----
  bySym = {};
  breakdown = [];
  M4_total = 0;
  M51 = 0;
  M52 = 0;

  for (const p of baselinePositions) {
    const st = getSym(p.symbol);
    if (p.qty > 0) {
      st.longLots.push({ qty: p.qty, cost: p.avgPrice, isToday: false, openPrice: p.avgPrice, time: evalISO });
    } else if (p.qty < 0) {
      st.shortLots.push({ qty: -p.qty, cost: p.avgPrice, isToday: false, openPrice: p.avgPrice, time: evalISO });
    }
  }

  const sortedTrades = [...rawTrades].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sortedTrades) {
    const st = getSym(t.symbol);
    const today = nyDateStr(t.date) === evalISO;
    if (t.side === 'BUY') {
      st.longLots.push({ qty: t.qty, cost: t.price, isToday: today, openPrice: t.price, time: t.date });
      if (today) st.behLong.push({ qty: t.qty, cost: t.price, isToday: true, openPrice: t.price, time: t.date });
    } else if (t.side === 'SHORT') {
      st.shortLots.push({ qty: t.qty, cost: t.price, isToday: today, openPrice: t.price, time: t.date });
      if (today) st.behShort.push({ qty: t.qty, cost: t.price, isToday: true, openPrice: t.price, time: t.date });
    } else if (t.side === 'SELL') {
      const preview = fifoPreview(st.longLots, t.qty);
      const previewTodayQty = preview.reduce((s, x) => (x.isToday ? s + x.qty : s), 0);
      const behAvailable = behAvail(st.behLong);
      const todayClosed = Math.min(previewTodayQty, behAvailable);
      if (process.env.MONITOR === '1') {
        console.log('[runAll SELL]', { previewTodayQty, behAvail: behAvailable, todayClosed });
      }
      for (const r of preview.filter((r) => !r.isToday)) {
        postM4_Long(r.qty, t.price, r.cost, t.symbol, t.date);
      }
      fifoApply(st.longLots, preview);
      const todayLots = behConsume(st.behLong, todayClosed);
      postM5_Long(todayLots, preview, t.price, t.symbol, t.date);
    } else if (t.side === 'COVER') {
      const preview = fifoPreview(st.shortLots, t.qty);
      const previewTodayQty = preview.reduce((s, x) => (x.isToday ? s + x.qty : s), 0);
      const behAvailable = behAvail(st.behShort);
      const todayClosed = Math.min(previewTodayQty, behAvailable);
      if (process.env.MONITOR === '1') {
        console.log('[runAll COVER]', { previewTodayQty, behAvail: behAvailable, todayClosed });
      }
      for (const r of preview.filter((r) => !r.isToday)) {
        postM4_Short(r.qty, t.price, r.cost, t.symbol, t.date);
      }
      fifoApply(st.shortLots, preview);
      const todayLots = behConsume(st.behShort, todayClosed);
      postM5_Short(todayLots, preview, t.price, t.symbol, t.date);
    }
  }

  const M4_override = M4_total;
  const M5_1_override = M51;
  const M5_2_override = M52;
  const M4_r = round2(M4_override);
  const M5_1_r = round2(M5_1_override);
  const M5_2_r = round2(M5_2_override);
  const M3_r = round2(metrics.M3);
  const M6_override = M4_r + M3_r + M5_2_r;

  const winRatePct = round1(metrics.M10.rate * 100);

  const result = {
    M1: round2(metrics.M1),
    M2: round2(metrics.M2),
    M3: M3_r,
    M4: M4_r,
    M5_1: M5_1_r,
    M5_2: M5_2_r,
    M6: round2(M6_override),
    M7: metrics.M7,
    M8: metrics.M8,
    M9,
    M10: { W: metrics.M10.win, L: metrics.M10.loss, winRatePct },
    M11,
    M12,
    M13,
    aux: { breakdown },
  } as const;

  if (process.env.MONITOR === "1") {
    snapshotArtifacts(
      {
        initialPositions: baselinePositions,
        rawTrades,
        closePrices,
        dailyResults: input.dailyResults || [],
      },
      result,
    );
    try {
      assertM6Equality(result);
      assertNoOverClose(enriched);
      assertLotConservation(baselinePositions, enriched);
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

export default runAll;
