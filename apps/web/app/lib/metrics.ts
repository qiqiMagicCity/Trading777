import type { EnrichedTrade, InitialPosition } from "@/lib/fifo";
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
import type { DailyResult } from "./types";
import { sumRealized } from "./metrics-period";
import { calcWinLossLots } from "./metrics-winloss";

// Only enable verbose logging outside production
const DEBUG = process.env.NODE_ENV !== "production";

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

/**
 * 计算数组总和的辅助函数
 * @param arr 数字数组
 * @returns 数组元素之和
 */
function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
function isTodayNY(dateStr: string | undefined, todayStr: string): boolean {
  if (!dateStr) return false;
  const d1 =
    dateStr.length === 10 ? toNY(`${dateStr}T12:00:00Z`) : toNY(dateStr);
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

function sumPeriod(daily: DailyResult[], fromStr: string, toStr: string) {
  const fromTS = toNY(fromStr).getTime();
  const toTS = toNY(toStr).getTime();
  let total = 0;
  for (const r of daily) {
    const ts = toNY(r.date).getTime();
    if (ts >= fromTS && ts <= toTS)
      total += (r.realized ?? 0) + (r.unrealized ?? 0);
  }
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
 * 计算日内交易盈亏（交易视角）
 * 按照交易匹配的方式，计算同一天内开仓并平仓的交易盈亏
 *
 * @param enrichedTrades 交易记录数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 日内交易盈亏
 */
/**
 * 计算日内交易盈亏（FIFO视角）
 * 按照先进先出原则，计算同一天内开仓并平仓的交易盈亏
 *
 * @param enrichedTrades 交易记录数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 日内交易盈亏
 */
export function calcTodayFifoPnL(
  enrichedTrades: EnrichedTrade[],
  todayStr: string,
  initialPositions: InitialPosition[] = [],
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  for (const pos of initialPositions) {
    const qty = Math.abs(pos.qty);
    if (qty === 0) continue;
    const lot = { qty, price: pos.avgPrice, date: "" };
    if (pos.qty >= 0) {
      if (!longFifo[pos.symbol]) longFifo[pos.symbol] = [];
      longFifo[pos.symbol]!.push(lot);
    } else {
      if (!shortFifo[pos.symbol]) shortFifo[pos.symbol] = [];
      shortFifo[pos.symbol]!.push(lot);
    }
  }
  let pnl = 0;
  const sorted = enrichedTrades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => isOnOrBeforeNY(t.date, todayStr))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
  for (const t of sorted) {
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
 * 计算历史交易盈亏（FIFO视角）
 * 按照先进先出原则，计算同一天内开仓并平仓的交易盈亏
 *
 * @param enrichedTrades 交易记录数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 日内交易盈亏
 */
function calcHistoryFifoPnL(
  enrichedTrades: EnrichedTrade[],
  todayStr: string,
  initialPositions: InitialPosition[] = [],
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  for (const pos of initialPositions) {
    const qty = Math.abs(pos.qty);
    if (qty === 0) continue;
    const lot = { qty, price: pos.avgPrice, date: "" };
    if (pos.qty >= 0) {
      if (!longFifo[pos.symbol]) longFifo[pos.symbol] = [];
      longFifo[pos.symbol]!.push(lot);
    } else {
      if (!shortFifo[pos.symbol]) shortFifo[pos.symbol] = [];
      shortFifo[pos.symbol]!.push(lot);
    }
  }
  let pnl = 0;
  const sorted = enrichedTrades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => isOnOrBeforeNY(t.date, todayStr))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
  for (const t of sorted) {
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

/**
 * 计算胜负笔数（FIFO 视角）
 * 遍历所有交易，按先进先出原则逐笔比对开平仓，统计每一笔配对结果
 * @param trades 交易记录数组
 * @returns 包含 wins 与 losses 计数
 */

function calcCumulativeTradeCounts(
  trades: EnrichedTrade[],
  initialPositions: InitialPosition[] = [],
) {
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

  for (const pos of initialPositions) {
    if (!pos.symbol || !isFinite(pos.qty)) continue;
    if (pos.qty > 0) B++;
    else if (pos.qty < 0) P++;
  }

  return { B, S, P, C, total: B + S + P + C };
}

export function calcM9(days: DailyResult[]): number {
  return sumRealized(days);
}

/**
 * Collect all closed lots (FIFO) up to a given date.
 *
 * Maintains separate FIFO queues for long and short lots. The queues are
 * pre-seeded with `initialPositions` and then progressed through each trade in
 * chronological order (NY timezone). For every SELL or COVER, quantities are
 * matched against the appropriate queue and a `{ pnl }` entry is pushed for
 * each matched lot.
 */
export function collectCloseLots(
  trades: EnrichedTrade[],
  initialPositions: InitialPosition[] = [],
  untilDateStr?: string,
): { pnl: number }[] {
  const longFifo: Record<string, { qty: number; price: number }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number }[]> = {};

  for (const pos of initialPositions) {
    const qty = Math.abs(pos.qty);
    if (qty === 0) continue;
    const lot = { qty, price: pos.avgPrice };
    if (pos.qty >= 0) {
      if (!longFifo[pos.symbol]) longFifo[pos.symbol] = [];
      longFifo[pos.symbol]!.push(lot);
    } else {
      if (!shortFifo[pos.symbol]) shortFifo[pos.symbol] = [];
      shortFifo[pos.symbol]!.push(lot);
    }
  }

  const untilEnd = untilDateStr
    ? endOfDayNY(toNY(`${untilDateStr}T12:00:00Z`))
    : undefined;

  const sorted = trades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => {
      if (!untilEnd) return true;
      const d = toNY(t.date);
      return !isNaN(d.getTime()) && d.getTime() <= untilEnd.getTime();
    })
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  const closes: { pnl: number }[] = [];

  for (const t of sorted) {
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
 * 计算周期性指标（WTD、MTD、YTD）
 *
 * @param dailyResults 每日交易结果数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 包含 wtd、mtd、ytd 的对象
 */
/**
 * 计算所有交易指标
 *
 * @param trades 交易记录数组
 * @param positions 持仓数组
 * @param dailyResults 每日交易结果数组
 * @param initialPositions 历史持仓数组
 * @returns 所有指标的计算结果
 */
export function calcMetrics(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = [],
  initialPositions: InitialPosition[] = [],
): Metrics {
  console.info("M7_INPUT", _count(trades), { sample: trades.slice(0, 3) });

  // 基于原始交易记录（保留重复项）计算统计
  const evalDateNY = nowNY();
  const todayStr = getLatestTradingDayStr(evalDateNY);
  const evalEnd = endOfDayNY(evalDateNY);
  const safeTrades = trades.filter((t) => {
    const d = toNY((t as any).time ?? t.date);
    return !isNaN(d.getTime()) && d.getTime() <= evalEnd.getTime();
  });
  console.info("M7_FILTERED", _count(safeTrades), {
    evalEndNY: evalEnd.toISOString?.(),
  });
  const counts = _count(safeTrades);

  // M1: 持仓成本
  const totalCost = sum(positions.map((p) => Math.abs(p.avgPrice * p.qty)));

  // M2: 持仓市值
  if (DEBUG) console.log("计算M2(持仓市值)，持仓数据:", positions);
  const currentValue = sum(
    positions.map((p) => {
      const marketValue = p.last * Math.abs(p.qty);
      if (DEBUG)
        console.log(`${p.symbol} 市值计算:`, {
          last: p.last,
          qty: p.qty,
          marketValue,
        });
      return marketValue;
    }),
  );
  if (DEBUG) console.log("M2(持仓市值)计算结果:", currentValue);

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
  const pnlTrade = calcTodayTradePnL(safeTrades, todayStr);
  const pnlFifo = calcTodayFifoPnL(safeTrades, todayStr, initialPositions);

  // M4: 今天持仓平仓盈利（仅历史仓位，不含日内交易）
  // 日内交易的 FIFO 盈亏已包含在 pnlFifo，需要剔除
  const todayHistoricalRealizedPnl = calcHistoryFifoPnL(
    safeTrades,
    todayStr,
    initialPositions,
  );
  if (DEBUG) console.log("M4计算结果:", todayHistoricalRealizedPnl);

  // M6: 今日总盈利变化
  const todayTotalPnlChange = round2(
    todayHistoricalRealizedPnl + pnlFifo + floatPnl,
  );
  console.info("M6_DEBUG", {
    M4: todayHistoricalRealizedPnl,
    M3: floatPnl,
    fifo: pnlFifo,
    total: todayTotalPnlChange,
  });

  // M7: 今日交易次数
  const todayTradeCountsByType = counts;
  const todayTradeCounts = counts.total;

  // M8: 累计交易次数（含历史持仓）
  const allTradesByType = calcCumulativeTradeCounts(
    safeTrades,
    initialPositions,
  );
  const totalTrades = allTradesByType.total;

  const historicalDailyResults = dailyResults.filter((r) => r.date <= todayStr);

  // M9: 所有历史平仓盈利（含今日）
  const historicalRealizedPnl = calcM9(historicalDailyResults);
  if (DEBUG) console.log("M9计算结果:", historicalRealizedPnl);

  // M10: 胜率
  const closes = collectCloseLots(safeTrades, initialPositions, todayStr);
  const { win, loss, flat, rate } = calcWinLossLots(closes);

  // M11-13: 周期性指标
  const { wtd, mtd, ytd } = calcWtdMtdYtd(historicalDailyResults, todayStr);

  return {
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
