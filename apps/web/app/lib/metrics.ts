import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from '@/lib/services/dataService';
import { nowNY, toNY } from '@/lib/timezone';
import { calcTodayTradePnL } from './calcTodayTradePnL';

// Only enable verbose logging outside production
const DEBUG = process.env.NODE_ENV !== 'production';

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
   * W: 盈利交易次数
   * L: 亏损交易次数
   * rate: 胜率百分比
   */
  M10: {
    W: number;
    L: number;
    rate: number;
  };

  /** M11: WTD (Week-To-Date) - 本周至今的盈亏总和 */
  M11: number;

  /** M12: MTD (Month-To-Date) - 本月至今的盈亏总和 */
  M12: number;

  /** M13: YTD (Year-To-Date) - 本年至今的盈亏总和 */
  M13: number;
}

/**
 * 每日交易结果接口
 */
export interface DailyResult {
  /** 日期，格式为 YYYY-MM-DD */
  date: string;

  /** 已实现盈亏 */
  realized: number;

  /** 浮动盈亏 */
  float: number;

  /** 今日日内交易盈利（交易视角） */
  M5_1: number;

  /** 总盈亏 (realized + float) */
  pnl: number;
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
function calcTodayFifoPnL(enrichedTrades: EnrichedTrade[], todayStr: string): number {
  const longFifo: Record<string, { qty: number; price: number; date: string }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number; date: string }[]> = {};
  let pnl = 0;
  const sorted = enrichedTrades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? 0 : timeA;
      const bTime = isNaN(timeB) ? 0 : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
  for (const t of sorted) {
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);
    if (action === 'buy') {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === 'sell') {
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
    } else if (action === 'short') {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === 'cover') {
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
function calcHistoryFifoPnL(enrichedTrades: EnrichedTrade[], todayStr: string): number {
  const longFifo: Record<string, { qty: number; price: number; date: string }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number; date: string }[]> = {};
  let pnl = 0;
  const sorted = enrichedTrades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? 0 : timeA;
      const bTime = isNaN(timeB) ? 0 : timeB;
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
        if (date?.startsWith(todayStr) && !lot.date?.startsWith(todayStr)) {
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
        if (date?.startsWith(todayStr) && !lot.date?.startsWith(todayStr)) {
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
function calcWinLossLots(trades: EnrichedTrade[]): { wins: number; losses: number } {
  const longFifo: Record<string, { qty: number; price: number }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number }[]> = {};

  let wins = 0;
  let losses = 0;

  const sorted = trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? 0 : timeA;
      const bTime = isNaN(timeB) ? 0 : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  for (const t of sorted) {
    const { symbol, action, price } = t;
    const quantity = Math.abs(t.quantity);

    if (action === 'buy') {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price });
    } else if (action === 'sell') {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        const pnl = (price - lot.price) * q;
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
    } else if (action === 'short') {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price });
    } else if (action === 'cover') {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        const pnl = (lot.price - price) * q;
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
    }
  }

  return { wins, losses };
}

/**
 * 根据 FIFO 拆分规则计算今日交易次数
 * B/P 为指令数，S/C 按平仓批次数统计
 * @param trades 所有交易记录
 * @param todayStr 今日日期字符串 (YYYY-MM-DD)
 */
function calcTodayTradeCounts(trades: EnrichedTrade[], todayStr: string) {
  const longFifo: Record<string, { qty: number }[]> = {};
  const shortFifo: Record<string, { qty: number }[]> = {};

  let B = 0;
  let S = 0;
  let P = 0;
  let C = 0;

  const sorted = trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? 0 : timeA;
      const bTime = isNaN(timeB) ? 0 : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  for (const t of sorted) {
    const { symbol, action, date } = t;
    const quantity = Math.abs(t.quantity);

    if (action === 'buy') {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity });
      if (isTodayNY(date, todayStr)) B++;
    } else if (action === 'sell') {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        lot.qty -= q;
        remain -= q;
        if (isTodayNY(date, todayStr)) S++;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol].push({ qty: remain });
        if (isTodayNY(date, todayStr)) P++;
      }
    } else if (action === 'short') {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity });
      if (isTodayNY(date, todayStr)) P++;
    } else if (action === 'cover') {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        lot.qty -= q;
        remain -= q;
        if (isTodayNY(date, todayStr)) C++;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol].push({ qty: remain });
        if (isTodayNY(date, todayStr)) B++;
      }
    }
  }

  return { B, S, P, C };
}

/**
 * 计算周期性指标（WTD、MTD、YTD）
 * 
 * @param dailyResults 每日交易结果数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 包含 wtd、mtd、ytd 的对象
 */
function calcPeriodMetrics(
  dailyResults: DailyResult[],
  todayStr: string
): { wtd: number; mtd: number; ytd: number } {
  const sumSince = (since: string) =>
    dailyResults.filter(r => r.date >= since).reduce((a, r) => a + r.pnl, 0);

  // Ensure calculations are based on New York time
  const today = toNY(`${todayStr}T00:00:00`);
  const day = (today.getDay() + 6) % 7; // Monday=0
  const monday = toNY(today);
  monday.setDate(today.getDate() - day);
  const mondayStr = monday.toISOString().slice(0, 10);

  return {
    wtd: sumSince(mondayStr),
    mtd: sumSince(todayStr.slice(0, 8) + '01'),
    ytd: sumSince(todayStr.slice(0, 4) + '-01-01'),
  };
}

/**
 * 计算所有交易指标
 * 
 * @param trades 交易记录数组
 * @param positions 持仓数组
 * @param dailyResults 每日交易结果数组
 * @returns 所有指标的计算结果
 */
export function calcMetrics(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = []
): Metrics {
  // 获取今日日期字符串（纽约时区）
  const todayStr = nowNY().toISOString().slice(0, 10);

  // M1: 持仓成本
  const totalCost = sum(positions.map(p => Math.abs(p.avgPrice * p.qty)));

  // M2: 持仓市值
  if (DEBUG) console.log('计算M2(持仓市值)，持仓数据:', positions);
  const currentValue = sum(positions.map(p => {
    const marketValue = p.last * Math.abs(p.qty);
    if (DEBUG) console.log(`${p.symbol} 市值计算:`, { last: p.last, qty: p.qty, marketValue });
    return marketValue;
  }));
  if (DEBUG) console.log('M2(持仓市值)计算结果:', currentValue);

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
  const pnlTrade = calcTodayTradePnL(trades, todayStr);
  const pnlFifo = calcTodayFifoPnL(trades, todayStr);

  // M4: 今天持仓平仓盈利（仅历史仓位，不含日内交易）
  // 日内交易的 FIFO 盈亏已包含在 pnlFifo，需要剔除
  const todayHistoricalRealizedPnl = calcHistoryFifoPnL(trades, todayStr);
  if (DEBUG) console.log('M4计算结果:', todayHistoricalRealizedPnl);

  // M6: 今日总盈利变化
  const todayTotalPnlChange = todayHistoricalRealizedPnl + pnlFifo + floatPnl;
  if (DEBUG) console.log('M6计算结果:', todayTotalPnlChange);

  // M7: 今日交易次数 (按 FIFO 拆分批次)
  const todayTradeCountsByType = calcTodayTradeCounts(trades, todayStr);
  const todayTradeCounts =
    todayTradeCountsByType.B +
    todayTradeCountsByType.S +
    todayTradeCountsByType.P +
    todayTradeCountsByType.C;

  // M8: 累计交易次数
  const allTradesByType = {
    B: trades.filter(t => t.action === 'buy').length,
    S: trades.filter(t => t.action === 'sell').length,
    P: trades.filter(t => t.action === 'short').length,
    C: trades.filter(t => t.action === 'cover').length
  };
  const totalTrades = allTradesByType.B + allTradesByType.S + allTradesByType.P + allTradesByType.C;

  // M9: 所有历史平仓盈利（含今日）
  const historicalRealizedPnl = dailyResults.length
    ? dailyResults.reduce((acc, r) => acc + r.realized, 0)
    : trades.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  if (DEBUG) console.log('M9计算结果:', historicalRealizedPnl);

  // M10: 胜率
  const { wins: winningTrades, losses: losingTrades } = calcWinLossLots(trades);
  const winRate = winningTrades + losingTrades > 0
    ? (winningTrades / (winningTrades + losingTrades)) * 100
    : 0;

  // M11-13: 周期性指标
  const { wtd, mtd, ytd } = calcPeriodMetrics(dailyResults, todayStr);

  return {
    M1: totalCost,
    M2: currentValue,
    M3: floatPnl,
    M4: todayHistoricalRealizedPnl,
    M5: {
      trade: pnlTrade,
      fifo: pnlFifo
    },
    M6: todayTotalPnlChange,
    M7: {
      B: todayTradeCountsByType.B,
      S: todayTradeCountsByType.S,
      P: todayTradeCountsByType.P,
      C: todayTradeCountsByType.C,
      total: todayTradeCounts
    },
    M8: {
      B: allTradesByType.B,
      S: allTradesByType.S,
      P: allTradesByType.P,
      C: allTradesByType.C,
      total: totalTrades
    },
    M9: historicalRealizedPnl,
    M10: {
      W: winningTrades,
      L: losingTrades,
      rate: winRate
    },
    M11: wtd,
    M12: mtd,
    M13: ytd
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
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * 格式化数字为通用格式
 * @param value 要格式化的数值
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的字符串
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
} 