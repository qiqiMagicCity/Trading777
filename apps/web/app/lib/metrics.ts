// === file: apps/web/app/lib/metrics.ts ===
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import {
  nowNY,
  toNY,
  getLatestTradingDayStr,
  endOfDayNY,
  startOfWeekNY,
  startOfMonthNY,
  startOfYearNY,
} from "@/lib/timezone";
import { calcTodayTradePnL } from "./calcTodayTradePnL";
import { sortTrades } from "./sortTrades";
import type { DailyResult } from "./types";
import { sumRealized } from "./metrics-period";
import { calcWinLossLots } from "./metrics-winloss";
import { logger } from "@/lib/logger";
import { round2 as mRound2 } from "./money";
import type { MetricsContract } from "./types/metrics";
import { calcM6Detailed, type M6PositionInput } from "./m6";

export function isDebug() {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    (new URLSearchParams(location.search).has("debug") ||
      process.env.NEXT_PUBLIC_DEBUG_METRICS === "1")
  );
}

// Only enable verbose logging outside production
const DEBUG = isDebug();

const EPSILON = 1e-6;

function seedInitialLots(
  trades: EnrichedTrade[],
  longFifo: Record<string, { qty: number; price: number; date: string }[]>,
  shortFifo: Record<string, { qty: number; price: number; date: string }[]>,
) {
  for (const trade of trades) {
    if (!trade.isInitialPosition) continue;
    const qty = Math.abs(trade.quantity);
    if (qty <= EPSILON) continue;
    const lot = { qty, price: trade.price, date: trade.date };
    if (trade.action === "short") {
      if (!shortFifo[trade.symbol]) shortFifo[trade.symbol] = [];
      shortFifo[trade.symbol]!.push(lot);
    } else {
      if (!longFifo[trade.symbol]) longFifo[trade.symbol] = [];
      longFifo[trade.symbol]!.push(lot);
    }
  }
}

/**
 * 交易系统指标接口
 * 定义了所有需要计算和展示的指标
 */
export interface Metrics {
  M1: number;
  M2: number;
  M3: number;
  M4: number;
  M5: {
    trade: number;
    fifo: number;
  };
  M6: number;
  M7: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };
  M8: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };
  M9: number;
  M10: {
    win: number;
    loss: number;
    flat: number;
    rate: number;
  };
  M11: number;
  M12: number;
  M13: number;
  aux?: {
    m6PriceChange?: number;
    m6PrevRealizedTotal?: number;
    m6FifoToday?: number;
    m6Legs?: Array<{
      symbol: string;
      qty: number;
      prevClose: number;
      priceNow: number;
      fx: number;
      mtm: number;
    }>;
    m6Excluded?: Array<{
      symbol: string;
      reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
    }>;
    missingPrevCloseSymbols?: string[];
  };
}

/** 价格映射类型，格式为 { 日期: { 股票代码: 价格 } } */
export type PriceMap = Record<string, Record<string, number>>;

export type RealizedBreakdownRow = {
  time: string;
  symbol: string;
  side: "sell" | "cover";
  into: "M4" | "M5.2";
  qty: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
};

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function reportMonitoring(message: string, details?: unknown): void {
  const url = process.env.NEXT_PUBLIC_MONITOR_URL;
  if (!url || typeof fetch !== "function") return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, details }),
  }).catch((err) => {
    logger.error("reportMonitoring failed", err);
  });
}

function normalizeDateInput(
  input: string | number | Date | undefined,
): string | number | Date | undefined {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (trimmed.length === 10) return trimmed;
  if (trimmed.includes(" ") && !trimmed.includes("T")) {
    return trimmed.replace(" ", "T");
  }
  return trimmed;
}

function normalizeDateLikeValue(
  value: string | number | Date | undefined,
): string | null {
  const normalized = normalizeDateInput(value);
  if (typeof normalized === "string") {
    const candidate =
      normalized.length === 10 ? `${normalized}T12:00:00Z` : normalized;
    const parsed = toNY(candidate);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
  }
  if (normalized instanceof Date) {
    return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString();
  }
  if (typeof normalized === "number") {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function resolveTradeDate(
  trade: Pick<EnrichedTrade, "date" | "time">,
): Date | null {
  const normalizedDate = normalizeDateInput(trade?.date);
  const normalizedTime = normalizeDateInput(trade?.time);
  const source =
    normalizedDate !== undefined
      ? normalizedDate
      : normalizedTime !== undefined
        ? normalizedTime
        : undefined;
  if (source === undefined) return null;
  const parsed =
    typeof source === "string" && source.length === 10
      ? toNY(`${source}T12:00:00Z`)
      : toNY(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assertM6(metrics: Metrics) {
  if (!DEBUG) return;
  const priceChange = metrics.aux?.m6PriceChange;
  const prevRealized = metrics.aux?.m6PrevRealizedTotal;
  if (!Number.isFinite(priceChange) || !Number.isFinite(prevRealized)) return;
  const expected = mRound2(
    (prevRealized as number) + metrics.M5.fifo + (priceChange as number),
  );
  if (metrics.M6 !== expected) {
    const data = {
      M4: metrics.M4,
      fifo: metrics.M5.fifo,
      M6: metrics.M6,
      priceChange,
      prevRealized,
      expected,
      missingPrevCloseSymbols: metrics.aux?.missingPrevCloseSymbols ?? [],
    };
    logger.warn("M6 mismatch", data);
    logger.warn(
      "M6 hint",
      "Check M6_QTY_DIAG_BEFORE/M6_QTY_PUSH logs for qty mismatch vs yesterdayQty",
    );
    reportMonitoring("M6 mismatch", data);
  }
}

function _count(list: { action?: string }[] | undefined) {
  const res = { B: 0, S: 0, P: 0, C: 0, total: 0 };
  if (!Array.isArray(list)) return res;
  for (const item of list) {
    switch (item?.action) {
      case "buy":
        res.B++;
        break;
      case "sell":
        res.S++;
        break;
      case "short":
        res.P++;
        break;
      case "cover":
        res.C++;
        break;
    }
  }
  res.total = res.B + res.S + res.P + res.C;
  return res;
}

/** 判断日期字符串是否为今日（纽约时区） */
function isTodayNY(
  dateInput: string | number | Date | undefined,
  todayStr: string,
): boolean {
  if (dateInput === undefined || dateInput === null) return false;
  const d1 =
    typeof dateInput === "string" && dateInput.length === 10
      ? toNY(`${dateInput}T12:00:00Z`)
      : toNY(dateInput);
  const d2 = toNY(`${todayStr}T12:00:00Z`);
  return (
    !isNaN(d1.getTime()) &&
    !isNaN(d2.getTime()) &&
    d1.toISOString().slice(0, 10) === d2.toISOString().slice(0, 10)
  );
}

function isOnOrBeforeNY(
  dateStr: string | undefined,
  todayStr: string,
): boolean {
  if (!dateStr) return true;
  const d = toNY(dateStr);
  const end = toNY(`${todayStr}T23:59:59.999`);
  return !isNaN(d.getTime()) && d.getTime() <= end.getTime();
}

function isValidTradeDate(
  dateStr: string | undefined,
  todayStr: string,
  context: string,
  trade: EnrichedTrade,
): boolean {
  if (!dateStr) {
    console.warn(`${context}: missing trade date`, trade);
    return false;
  }
  const d = toNY(dateStr);
  if (isNaN(d.getTime())) {
    console.warn(`${context}: invalid trade date`, dateStr, trade);
    return false;
  }
  const end = toNY(`${todayStr}T23:59:59.999`);
  if (d.getTime() > end.getTime()) {
    console.warn(`${context}: future trade date`, dateStr, trade);
    return false;
  }
  return true;
}

/**
 * 缓存结构用于快速计算区间盈亏
 */
type SumPeriodCache = {
  daily: DailyResult[];
  dailyLength: number;
  lastDate?: string;
  dates: number[];
  prefix: number[];
  lastFrom?: string;
  lastTo?: string;
  lastResult?: number;
};

let sumPeriodCache: SumPeriodCache | null = null;

function rebuildSumPeriodCache(daily: DailyResult[]): SumPeriodCache {
  const sorted = daily.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const dates: number[] = [];
  const prefix: number[] = [];
  let prevUnrealized = 0;
  let acc = 0;
  for (const r of sorted) {
    const ts = toNY(r.date).getTime();
    const unrealized = r.unrealized ?? 0;
    const delta =
      r.unrealizedDelta !== undefined
        ? r.unrealizedDelta
        : unrealized - prevUnrealized;
    acc += (r.realized ?? 0) + delta;
    dates.push(ts);
    prefix.push(acc);
    prevUnrealized = unrealized;
  }
  return {
    daily,
    dailyLength: daily.length,
    lastDate: daily[daily.length - 1]?.date,
    dates,
    prefix,
  };
}

function lowerBound(arr: number[], target: number) {
  let l = 0,
    r = arr.length;
  while (l < r) {
    const m = (l + r) >> 1;
    const midVal = arr[m]!;
    if (midVal < target) l = m + 1;
    else r = m;
  }
  return l;
}

function upperBound(arr: number[], target: number) {
  let l = 0,
    r = arr.length;
  while (l < r) {
    const m = (l + r) >> 1;
    const midVal = arr[m]!;
    if (midVal <= target) l = m + 1;
    else r = m;
  }
  return l - 1;
}

export function sumPeriod(
  daily: DailyResult[],
  fromStr: string,
  toStr: string,
) {
  const lastDate = daily[daily.length - 1]?.date;
  if (
    !sumPeriodCache ||
    sumPeriodCache.daily !== daily ||
    sumPeriodCache.dailyLength !== daily.length ||
    sumPeriodCache.lastDate !== lastDate
  ) {
    sumPeriodCache = rebuildSumPeriodCache(daily);
  } else if (
    sumPeriodCache.lastFrom === fromStr &&
    sumPeriodCache.lastTo === toStr
  ) {
    return sumPeriodCache.lastResult ?? 0;
  }

  const fromTS = toNY(fromStr).getTime();
  const toTS = toNY(toStr).getTime();
  const { dates, prefix } = sumPeriodCache;

  const startIdx = lowerBound(dates, fromTS);
  const endIdx = upperBound(dates, toTS);
  let total = 0;
  if (endIdx >= startIdx && endIdx >= 0 && endIdx < prefix.length) {
    const prev = startIdx === 0 ? 0 : prefix[startIdx - 1]!;
    total = prefix[endIdx]! - prev;
  }

  sumPeriodCache.lastFrom = fromStr;
  sumPeriodCache.lastTo = toStr;
  sumPeriodCache.lastResult = total;

  return total;
}

export function calcWtdMtdYtd(daily: DailyResult[], evalDateStr: string) {
  const evalDate = toNY(evalDateStr);
  const wStart = startOfWeekNY(evalDate);
  const mStart = startOfMonthNY(evalDate);
  const yStart = startOfYearNY(evalDate);
  const endStr = evalDateStr;
  return {
    wtd: sumPeriod(daily, wStart.toISOString().slice(0, 10), endStr),
    mtd: sumPeriod(daily, mStart.toISOString().slice(0, 10), endStr),
    ytd: sumPeriod(daily, yStart.toISOString().slice(0, 10), endStr),
  };
}

export function calcM9FromDaily(
  daily: DailyResult[],
  evalDateStr: string,
): number {
  const end = toNY(evalDateStr).getTime();
  let total = 0;
  for (const r of daily) {
    const ts = toNY(r.date).getTime();
    if (ts <= end) total += r.realized ?? 0;
  }
  return total;
}

export function checkPeriodDebug(daily: DailyResult[], evalDateStr: string) {
  if (!DEBUG) return;
  const evalDate = toNY(evalDateStr);
  const wStart = startOfWeekNY(evalDate).toISOString().slice(0, 10);
  const mStart = startOfMonthNY(evalDate).toISOString().slice(0, 10);
  const yStart = startOfYearNY(evalDate).toISOString().slice(0, 10);
  const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, evalDateStr);
  const m9 = calcM9FromDaily(daily, evalDateStr);
  console.table([
    { metric: "evalDateStr", value: evalDateStr },
    { metric: "weekStart", value: wStart },
    { metric: "monthStart", value: mStart },
    { metric: "yearStart", value: yStart },
    { metric: "wtd", value: wtd, expected: 8952.5 },
    { metric: "mtd", value: mtd, expected: 8952.5 },
    { metric: "ytd", value: ytd, expected: 8952.5 },
    { metric: "M9", value: m9, expected: 7850 },
  ]);
}

/**
 * 计算日内交易盈亏（FIFO视角）
 */
export function calcTodayFifoPnL(
  sortedTrades: EnrichedTrade[],
  todayStr: string,
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  seedInitialLots(sortedTrades, longFifo, shortFifo);
  let pnl = 0;
  for (const t of sortedTrades) {
    if (!isValidTradeDate(t.date, todayStr, "calcTodayFifoPnL", t)) continue;
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);
    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "sell") {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && isTodayNY(lot.date, todayStr)) {
          pnl += (price - lot.price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol].push({ qty: remain, price, date });
      }
    } else if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "cover") {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && isTodayNY(lot.date, todayStr)) {
          pnl += (lot.price - price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol].push({ qty: remain, price, date });
      }
    }
  }
  return pnl;
}

/**
 * 计算历史交易盈亏（FIFO视角）——用于 M4
 */
export function calcHistoryFifoPnL(
  sortedTrades: EnrichedTrade[],
  todayStr: string,
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  seedInitialLots(sortedTrades, longFifo, shortFifo);
  let pnl = 0;
  for (const t of sortedTrades) {
    if (!isValidTradeDate(t.date, todayStr, "calcHistoryFifoPnL", t)) continue;
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);
    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "sell") {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && !isTodayNY(lot.date, todayStr)) {
          pnl += (price - lot.price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol].push({ qty: remain, price, date });
      }
    } else if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "cover") {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && !isTodayNY(lot.date, todayStr)) {
          pnl += (lot.price - price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol].push({ qty: remain, price, date });
      }
    }
  }
  return pnl;
}

export function debugTodayRealizedBreakdown(
  trades: EnrichedTrade[],
  evalDateStr: string,
): { rows: RealizedBreakdownRow[]; sumM4: number; sumM52: number } {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  seedInitialLots(trades, longFifo, shortFifo);

  const sorted = trades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => isOnOrBeforeNY(t.date, evalDateStr))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  const rows: RealizedBreakdownRow[] = [];

  for (const t of sorted) {
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);

    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
      continue;
    }

    if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
      continue;
    }

    const isCloseToday = isTodayNY(date, evalDateStr);
    let remain = quantity;
    const fifo =
      action === "sell" ? longFifo[symbol] || [] : shortFifo[symbol] || [];

    while (remain > 0 && fifo.length > 0) {
      const lot = fifo[0]!;
      const q = Math.min(lot.qty, remain);
      if (isCloseToday) {
        const openToday = isTodayNY(lot.date, evalDateStr);
        const into = openToday ? "M5.2" : "M4";
        const openPrice = lot.price;
        const closePrice = price;
        const pnl =
          action === "sell"
            ? (closePrice - openPrice) * q
            : (openPrice - closePrice) * q;
        rows.push({
          time: date,
          symbol,
          side: action,
          into,
          qty: q,
          openPrice,
          closePrice,
          pnl,
        });
      }
      lot.qty -= q;
      remain -= q;
      if (lot.qty === 0) fifo.shift();
    }

    if (remain > 0) {
      if (action === "sell") {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol]!.push({ qty: remain, price, date });
      } else if (action === "cover") {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol]!.push({ qty: remain, price, date });
      }
    }
  }

  const sumM4 = rows
    .filter((r) => r.into === "M4")
    .reduce((acc, r) => acc + r.pnl, 0);
  const sumM52 = rows
    .filter((r) => r.into === "M5.2")
    .reduce((acc, r) => acc + r.pnl, 0);

  return { rows, sumM4, sumM52 };
}

/**
 * 累计交易次数（含历史持仓一次）
 */
function calcCumulativeTradeCounts(trades: EnrichedTrade[]) {
  let B = 0;
  let S = 0;
  let P = 0;
  let C = 0;

  for (const t of trades) {
    switch (t.action) {
      case "buy":
        B++;
        break;
      case "sell":
        S++;
        break;
      case "short":
        P++;
        break;
      case "cover":
        C++;
        break;
    }
  }
  return { B, S, P, C, total: B + S + P + C };
}

export function calcM9(days: DailyResult[]): number {
  return sumRealized(days);
}

/**
 * Collect all closed lots (FIFO) up to a given date.
 */
export function collectCloseLots(
  sortedTrades: EnrichedTrade[],
  untilDateStr?: string,
): { pnl: number }[] {
  const longFifo: Record<string, { qty: number; price: number }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number }[]> = {};

  for (const trade of sortedTrades) {
    if (!trade.isInitialPosition) continue;
    const qty = Math.abs(trade.quantity);
    if (qty === 0) continue;
    const lot = { qty, price: trade.price };
    if (trade.action === "short") {
      if (!shortFifo[trade.symbol]) shortFifo[trade.symbol] = [];
      shortFifo[trade.symbol]!.push(lot);
    } else {
      if (!longFifo[trade.symbol]) longFifo[trade.symbol] = [];
      longFifo[trade.symbol]!.push(lot);
    }
  }

  const untilEnd = untilDateStr
    ? endOfDayNY(toNY(`${untilDateStr}T12:00:00Z`))
    : undefined;

  const closes: { pnl: number }[] = [];

  for (const t of sortedTrades) {
    if (untilEnd) {
      const d = toNY(t.date);
      if (isNaN(d.getTime()) || d.getTime() > untilEnd.getTime()) continue;
    }
    const { symbol, action, price } = t;
    const quantity = Math.abs(t.quantity);

    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol]!.push({ qty: quantity, price });
    } else if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol]!.push({ qty: quantity, price });
    } else if (action === "sell") {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        closes.push({ pnl: (price - lot.price) * q });
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol]!.push({ qty: remain, price });
      }
    } else if (action === "cover") {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        closes.push({ pnl: (lot.price - price) * q });
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol]!.push({ qty: remain, price });
      }
    }
  }

  return closes;
}

/**
 * 计算所有交易指标
 */
function calcMetricsInternal(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = [],
): Metrics {
  if (DEBUG)
    logger.debug("M7_INPUT", _count(trades), {
      sample: trades.slice(0, 3),
    });

  // 基于原始交易记录（保留重复项）计算统计
  const evalDateNY = nowNY();

  const initialTodayStr = getLatestTradingDayStr(evalDateNY);
  const evalEnd = endOfDayNY(toNY(`${initialTodayStr}T12:00:00Z`));

  const safeTrades: EnrichedTrade[] = [];
  const tradeEntries: Array<{ trade: EnrichedTrade; date: Date; day: string }> = [];

  for (const trade of trades) {
    const parsed = resolveTradeDate(trade);
    if (!parsed) continue;
    if (parsed.getTime() > evalEnd.getTime()) continue;

    const day = parsed.toISOString().slice(0, 10);

    const normalizedDateValue = normalizeDateLikeValue(trade.date);
    const normalizedTimeValue = normalizeDateLikeValue(
      trade.time as string | number | Date | undefined,
    );
    const canonicalDate = normalizedDateValue ?? normalizedTimeValue ?? parsed.toISOString();
    const canonicalTime = normalizedTimeValue ?? normalizedDateValue ?? parsed.toISOString();

    const normalizedTrade: EnrichedTrade = {
      ...trade,
      date: canonicalDate,
      time: canonicalTime,
    };

    safeTrades.push(normalizedTrade);
    tradeEntries.push({ trade: normalizedTrade, date: parsed, day });
  }

  let todayStr = initialTodayStr;
  const hasTradeOnInitialDay = tradeEntries.some((entry) => entry.day === todayStr);
  if (!hasTradeOnInitialDay) {
    let latestTradeDay: string | null = null;
    for (const entry of tradeEntries) {
      if (!latestTradeDay || entry.day > latestTradeDay) {
        latestTradeDay = entry.day;
      }
    }
    if (latestTradeDay && latestTradeDay < todayStr) {
      todayStr = latestTradeDay;
    }
  }

  const todayTrades = tradeEntries
    .filter((entry) => entry.day === todayStr)
    .map((entry) => entry.trade);

  const counts = _count(todayTrades);

  if (DEBUG)
    logger.debug(
      "M7_FILTERED",
      { all: _count(safeTrades), today: counts },
      {
        evalEndNY: evalEnd.toISOString?.(),
      },
    );

  const sortedTrades = sortTrades(safeTrades);

  // M1: 持仓成本
  const totalCost = sum(positions.map((p) => Math.abs(p.avgPrice * p.qty)));

  // M2: 持仓市值
  const currentValue = sum(
    positions.map((p) => {
      const marketValue = p.last * Math.abs(p.qty);
      return marketValue;
    }),
  );

  // M3: 持仓浮盈
  const floatPnl = positions.reduce((acc, pos) => {
    const qty = Math.abs(pos.qty);
    if (pos.qty >= 0) {
      return acc + (pos.last - pos.avgPrice) * qty;
    } else {
      return acc + (pos.avgPrice - pos.last) * qty;
    }
  }, 0);

  // M5
  const pnlTrade = calcTodayTradePnL(sortedTrades, todayStr);
  const pnlFifo = calcTodayFifoPnL(sortedTrades, todayStr);

  // M4
  const todayHistoricalRealizedPnl = calcHistoryFifoPnL(
    sortedTrades,
    todayStr,
  );

  const positionMap = new Map<string, Position>();
  for (const pos of positions) {
    if (!pos?.symbol) continue;
    positionMap.set(pos.symbol, pos);
  }

  const todayNetChange = new Map<string, number>();
  const lastTradePriceToday = new Map<string, number>();
  for (const trade of todayTrades) {
    if (!trade?.symbol) continue;
    const qty = Math.abs(Number(trade.quantity));
    if (!Number.isFinite(qty) || qty <= EPSILON) continue;
    if (Number.isFinite(Number(trade.price))) {
      lastTradePriceToday.set(trade.symbol, Number(trade.price));
    }
    let delta = 0;
    switch (trade.action) {
      case "buy":
      case "cover":
        delta = qty;
        break;
      case "sell":
      case "short":
        delta = -qty;
        break;
      default:
        continue;
    }
    todayNetChange.set(
      trade.symbol,
      (todayNetChange.get(trade.symbol) ?? 0) + delta,
    );
  }

  const symbolsForPrev = new Set<string>([
    ...positionMap.keys(),
    ...todayNetChange.keys(),
  ]);

  const positionsForM6: M6PositionInput[] = [];
  const missingPrevCloseSymbols = new Set<string>();

  for (const symbol of symbolsForPrev) {
    const pos = positionMap.get(symbol);
    const currentQty = Number(pos?.qty ?? 0);
    if (!Number.isFinite(currentQty) || Math.abs(currentQty) <= EPSILON) {
      continue;
    }

    const todayDelta = todayNetChange.get(symbol) ?? 0;
    if (DEBUG) {
      logger.debug("M6_QTY_DIAG_BEFORE", {
        symbol,
        currentQty,
        todayDelta,
        expectedYesterdayQty: mRound2(currentQty - todayDelta),
      });
    }

    const priceNowValue = Number(pos?.last);
    const priceNow = Number.isFinite(priceNowValue) ? priceNowValue : null;
    const prevCloseValue = Number(pos?.prevClose);
    const prevClose = Number.isFinite(prevCloseValue) ? prevCloseValue : null;
    if (prevClose == null) {
      missingPrevCloseSymbols.add(symbol);
    }

    if (DEBUG) {
      logger.debug("M6_QTY_PUSH", {
        symbol,
        qtyUsedForMtm: currentQty,
        note: "If this differs from expectedYesterdayQty above, M6 will be off.",
      });
    }

    positionsForM6.push({
      symbol,
      qty: currentQty,
      priceNow,
      prevClose,
    });
  }

  const m6Computation = calcM6Detailed({
    positions: positionsForM6,
    M4: todayHistoricalRealizedPnl,
    M5_FIFO: pnlFifo,
    nowMarkFallback: (symbol) => {
      const tradePrice = lastTradePriceToday.get(symbol);
      return Number.isFinite(tradePrice) ? Number(tradePrice) : null;
    },
  });

  for (const warning of m6Computation.warnings) {
    if (warning.reason === "MISSING_PREV_CLOSE") {
      missingPrevCloseSymbols.add(warning.symbol);
    }
  }

  const priceChangeRounded = mRound2(m6Computation.mtm);
  const todayTotalPnlChange = m6Computation.total;

  if (DEBUG)
    logger.debug("M6_DEBUG", {
      prevRealized: todayHistoricalRealizedPnl,
      fifo: pnlFifo,
      priceChange: priceChangeRounded,
      total: todayTotalPnlChange,
      missingPrevCloseSymbols: Array.from(missingPrevCloseSymbols),
      legs: m6Computation.legs,
      excluded: m6Computation.warnings,
      M3: floatPnl,
    });

  // M7
  const todayTradeCountsByType = counts;
  const todayTradeCounts = counts.total;

  // M8
  const allTradesByType = calcCumulativeTradeCounts(safeTrades);
  const totalTrades = allTradesByType.total;

  const historicalDailyResults = dailyResults.filter((r) => r.date <= todayStr);

  // M9
  const historicalRealizedPnl = calcM9(historicalDailyResults);

  // M10
  const closes = collectCloseLots(sortedTrades, todayStr);
  const { win, loss, flat, rate } = calcWinLossLots(closes);

  // M11-13
  const { wtd, mtd, ytd } = calcWtdMtdYtd(historicalDailyResults, todayStr);

  const metrics: Metrics = {
    M1: totalCost,
    M2: currentValue,
    M3: floatPnl,
    M4: todayHistoricalRealizedPnl,
    M5: {
      trade: pnlTrade,
      fifo: pnlFifo,
    },
    M6: todayTotalPnlChange,
    M7: {
      B: todayTradeCountsByType.B,
      S: todayTradeCountsByType.S,
      P: todayTradeCountsByType.P,
      C: todayTradeCountsByType.C,
      total: todayTradeCounts,
    },
    M8: {
      B: allTradesByType.B,
      S: allTradesByType.S,
      P: allTradesByType.P,
      C: allTradesByType.C,
      total: totalTrades,
    },
    M9: historicalRealizedPnl,
    M10: {
      win,
      loss,
      flat,
      rate,
    },
    M11: wtd,
    M12: mtd,
    M13: ytd,
    aux: {
      m6PriceChange: priceChangeRounded,
      m6PrevRealizedTotal: mRound2(todayHistoricalRealizedPnl),
      m6FifoToday: mRound2(pnlFifo),
      m6Legs: m6Computation.legs.map((leg) => ({
        ...leg,
        mtm: mRound2(leg.mtm),
      })),
      m6Excluded: m6Computation.warnings,
      missingPrevCloseSymbols: Array.from(missingPrevCloseSymbols),
    },
  };

  assertM6(metrics);

  return metrics;
}

export function calcMetrics(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = [],
): Metrics {
  try {
    return calcMetricsInternal(trades, positions, dailyResults);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error("calcMetrics failed", e);
    reportMonitoring("calcMetrics failed", {
      error: e.message,
      stack: e.stack,
    });
    throw err;
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value)) return "N/A";
  return value.toFixed(decimals);
}

export function normalizeMetrics(input: any): MetricsContract {
  const pickTotal = (v: any) => (typeof v === "number" ? v : v?.total ?? 0);
  const normalizeCounts = (value: any) => {
    const B = Number(value?.B ?? value?.buy ?? 0);
    const S = Number(value?.S ?? value?.sell ?? 0);
    const P = Number(value?.P ?? value?.short ?? 0);
    const C = Number(value?.C ?? value?.cover ?? 0);
    const totalRaw = value?.total;
    const total =
      totalRaw !== undefined && Number.isFinite(Number(totalRaw))
        ? Number(totalRaw)
        : B + S + P + C;
    return { B, S, P, C, total };
  };
  const normalizeWinLoss = (value: any) => {
    const win = Number(value?.win ?? value?.W ?? 0);
    const loss = Number(value?.loss ?? value?.L ?? 0);
    const flat = Number(value?.flat ?? value?.F ?? 0);
    let rateRaw = value?.rate ?? value?.winRate ?? value?.winRatePct;
    let rate = Number(rateRaw);
    if (!Number.isFinite(rate)) {
      const denom = win + loss;
      rate = denom > 0 ? win / denom : 0;
    } else if (rate > 1.0000001) {
      rate = rate / 100;
    }
    return { win, loss, flat, rate };
  };

  const M1 = Number(input?.M1 ?? 0);
  const M2 = Number(input?.M2 ?? 0);
  const M3 = Number(input?.M3 ?? 0);
  const M4 = { total: pickTotal(input?.M4) };
  const M5 = {
    behavior: Number(
      input?.M5?.behavior ?? input?.M5?.trade ?? input?.M5_1 ?? 0,
    ),
    fifo: Number(input?.M5?.fifo ?? input?.M5_2 ?? 0),
  };
  const M6 = { total: pickTotal(input?.M6) };
  const M7 = normalizeCounts(input?.M7 ?? {});
  const M8 = normalizeCounts(input?.M8 ?? {});
  const M9 = Number(
    input?.M9 ?? input?.realized ?? input?.aux?.m6PrevRealizedTotal ?? 0,
  );
  const M10 = normalizeWinLoss(input?.M10 ?? {});
  const rawPriceChange = input?.aux?.m6PriceChange ?? input?.M6?.priceChange;
  const priceChange =
    typeof rawPriceChange === "number" && Number.isFinite(rawPriceChange)
      ? rawPriceChange
      : undefined;
  const prevRealized = input?.aux?.m6PrevRealizedTotal;
  const fifoToday = input?.aux?.m6FifoToday;
  const m6Legs = Array.isArray(input?.aux?.m6Legs)
    ? input.aux.m6Legs.filter(
        (leg: any) =>
          leg && typeof leg.symbol === "string" && Number.isFinite(leg.qty),
      )
    : undefined;
  const m6Excluded = Array.isArray(input?.aux?.m6Excluded)
    ? input.aux.m6Excluded.filter(
        (row: any) =>
          row &&
          typeof row.symbol === "string" &&
          (row.reason === "MISSING_PREV_CLOSE" || row.reason === "MISSING_MARK"),
      )
    : undefined;
  const missingPrevCloseSymbols = Array.isArray(
    input?.aux?.missingPrevCloseSymbols,
  )
    ? input.aux.missingPrevCloseSymbols.filter(
        (s: unknown): s is string => typeof s === "string",
      )
    : [];
  const aux = {
    breakdown: input?.aux?.breakdown ?? [],
    m6PriceChange: priceChange,
    m6PrevRealizedTotal:
      typeof prevRealized === "number" && Number.isFinite(prevRealized)
        ? prevRealized
        : undefined,
    m6FifoToday:
      typeof fifoToday === "number" && Number.isFinite(fifoToday)
        ? fifoToday
        : undefined,
    m6Legs,
    m6Excluded,
    missingPrevCloseSymbols,
  };
  return {
    M1,
    M2,
    M3,
    M4,
    M5,
    M6,
    M7,
    M8,
    M9,
    M10,
    M11: input?.M11,
    M12: input?.M12,
    M13: input?.M13,
    aux,
  };
}

// 兼容监控的扁平投影（监控/脚本可能用到）
export function projectToM6(input: any) {
  const m = normalizeMetrics(input);
  return { M3: m.M3, M4: m.M4.total, M5_2: m.M5.fifo, M6: m.M6.total };
}
