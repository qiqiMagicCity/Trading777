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
import { add as mAdd, round2 as mRound2 } from "./money";
import type { MetricsContract } from "./types/metrics";


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
  /** M1: 持仓成本 - 所有持仓的成本总和 */
  M1: number;

  /** M2: 持仓市值 - 所有持仓的当前市场价值总和 */
  M2: number;

  /** M3: 持仓浮盈 - 所有持仓的未实现盈亏总和 */
  M3: number;

  /** M4: 今天持仓平仓盈利 - 今日平掉历史仓位的盈亏 */
  M4: number;

  /**
   * M5: 今日日内交易盈利 - 同一天内开仓并平仓的交易盈亏
   * trade: 交易视角，按交易匹配计算
   * fifo: FIFO视角，按先进先出原则计算
   */
  M5: {
    trade: number;
    fifo: number;
  };

  /** M6: 今日总盈利变化 - 今日历史仓位平仓盈亏、日内 FIFO 盈亏与浮动盈亏之和 */
  M6: number;

  /**
   * M7: 今日交易次数 - 今日各类型交易的次数统计
   * B: 买入次数
   * S: 卖出次数
   * P: 做空次数
   * C: 回补次数
   * total: 总交易次数
   */
  M7: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };

  /**
   * M8: 累计交易次数 - 历史各类型交易的次数统计
   * B: 买入次数
   * S: 卖出次数
   * P: 做空次数
   * C: 回补次数
   * total: 总交易次数
   */
  M8: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };

  /** M9: 所有历史平仓盈利 - 所有已实现盈亏的累计和 */
  M9: number;

  /**
   * M10: 胜率统计
   * win: 盈利交易次数
   * loss: 亏损交易次数
   * flat: 盈亏为0的交易次数
   * rate: 胜率（win / (win + loss)）
   */
  M10: {
    win: number;
    loss: number;
    flat: number;
    rate: number;
  };

  /** M11: WTD (Week-To-Date) - 本周至今的盈亏总和 */
  M11: number;

  /** M12: MTD (Month-To-Date) - 本月至今的盈亏总和 */
  M12: number;

  /** M13: YTD (Year-To-Date) - 本年至今的盈亏总和 */
  M13: number;
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

/**
 * 计算数组总和的辅助函数
 * @param arr 数字数组
 * @returns 数组元素之和
 */
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

export function assertM6(metrics: Metrics) {
  if (!DEBUG) return;
  const expected = mRound2(mAdd(metrics.M4, metrics.M3, metrics.M5.fifo));
  if (metrics.M6 !== expected) {
    const data = {
      M4: metrics.M4,
      M3: metrics.M3,
      fifo: metrics.M5.fifo,
      M6: metrics.M6,
      expected,
    };
    logger.warn("M6 mismatch", data);
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
  /** 原始 daily 引用，用于判断是否需要重建缓存 */
  daily: DailyResult[];
  /** 缓存时 daily 的长度 */
  dailyLength: number;
  /** 缓存时最后一条记录的日期 */
  lastDate?: string;
  /** 按日期排序后的时间戳数组 */
  dates: number[];
  /** 累计收益前缀和 */
  prefix: number[];
  /** 最近一次查询的起始、结束日期及结果 */
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
  const todayStr = getLatestTradingDayStr(evalDateNY);
  const evalEnd = endOfDayNY(evalDateNY);
  const safeTrades = trades.filter((t) => {
    const d = toNY(t.time ?? t.date);
    return !isNaN(d.getTime()) && d.getTime() <= evalEnd.getTime();
  });

  const todayTrades = safeTrades.filter((t) =>
    isTodayNY(t.time ?? t.date, todayStr),
  );
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
      // 多头: (市价 - 均价) * 数量
      return acc + (pos.last - pos.avgPrice) * qty;
    } else {
      // 空头: (均价 - 市价) * 数量
      return acc + (pos.avgPrice - pos.last) * qty;
    }
  }, 0);

  // M5: 日内交易（先计算，后续 M4 需要用到 pnlFifo）
  const pnlTrade = calcTodayTradePnL(sortedTrades, todayStr);
  const pnlFifo = calcTodayFifoPnL(sortedTrades, todayStr);

  // M4: 今天持仓平仓盈利（仅历史仓位，不含日内交易）
  const todayHistoricalRealizedPnl = calcHistoryFifoPnL(
    sortedTrades,
    todayStr,
  );

  // M6: 今日总盈利变化
  const todayTotalPnlChange = mRound2(
    mAdd(todayHistoricalRealizedPnl, pnlFifo, floatPnl),
  );

  if (DEBUG)
    logger.debug("M6_DEBUG", {
      M4: todayHistoricalRealizedPnl,
      M3: floatPnl,
      fifo: pnlFifo,
      total: todayTotalPnlChange,
    });

  // M7: 今日交易次数
  const todayTradeCountsByType = counts;
  const todayTradeCounts = counts.total;

  // M8: 累计交易次数（含历史持仓）
  const allTradesByType = calcCumulativeTradeCounts(safeTrades);
  const totalTrades = allTradesByType.total;

  const historicalDailyResults = dailyResults.filter((r) => r.date <= todayStr);

  // M9: 所有历史平仓盈利（含今日）
  const historicalRealizedPnl = calcM9(historicalDailyResults);

  // M10: 胜率
  const closes = collectCloseLots(sortedTrades, todayStr);
  const { win, loss, flat, rate } = calcWinLossLots(closes);

  // M11-13: 周期性指标
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

/**
 * 格式化数字为货币格式
 * @param value 要格式化的数值
 * @returns 格式化后的字符串，包含美元符号 ($)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * 格式化数字为通用格式
 * @param value 要格式化的数值
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的字符串
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value)) return "N/A";
  return value.toFixed(decimals);
}

export function normalizeMetrics(input:any): MetricsContract {
  const pickTotal = (v:any)=> typeof v==='number' ? v : (v?.total ?? 0);
  const M1 = Number(input?.M1 ?? 0);
  const M2 = Number(input?.M2 ?? 0);
  const M3 = Number(input?.M3 ?? 0);
  const M4 = { total: pickTotal(input?.M4) };
  const M5 = {
    behavior: Number(
      input?.M5?.behavior ?? input?.M5?.trade ?? input?.M5_1 ?? 0,
    ),
    fifo:      Number(input?.M5?.fifo      ?? input?.M5_2 ?? 0),
  };
  const M6 = { total: pickTotal(input?.M6) };
  const aux = { breakdown: input?.aux?.breakdown ?? [] };
  return { M1, M2, M3, M4, M5, M6, M7:input?.M7, M8:input?.M8, M9:input?.M9, M10:input?.M10, M11:input?.M11, M12:input?.M12, M13:input?.M13, aux };
}

// 兼容监控的扁平投影（监控/脚本可能用到）
export function projectToM6(input:any){
  const m = normalizeMetrics(input);
  return { M3: m.M3, M4: m.M4.total, M5_2: m.M5.fifo, M6: m.M6.total };
}
