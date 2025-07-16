
import type { Trade } from './services/dataService';

/**
 * 全局统一使用纽约时间（America/New_York）做“自然日”边界，与服务器时区无关。
 * 所有基于“今天 / 本周 / 本月 / 本年”的计算都依赖此函数。
 */
function toNYDate(dateInput: string | number | Date): Date {
  // 先把输入转换成 Date，再格式化为纽约时区的本地字符串，再 new Date 得到
  return new Date(
    new Date(dateInput).toLocaleString('en-US', { timeZone: 'America/New_York' }),
  );
}

const EPSILON = 1e-6;

/** ---------- FIFO撮合（与原版本兼容） ---------- */

type PositionLot = {
  price: number;
  quantity: number; // 正数，无方向
  openDate: string; // 'YYYY-MM-DD' in NY
};

type Direction = 'NONE' | 'LONG' | 'SHORT';

type SymbolState = {
  longLots: PositionLot[];   // 多头 FIFO 队列
  shortLots: PositionLot[];  // 空头 FIFO 队列
  direction: Direction;
  accumulatedRealizedPnl: number;
  tradeCount: number;
};

export type EnrichedTrade = Trade & {
  id?: number;            // 保留原交易ID
  weekday: number;        // 纽约周一 = 1
  tradeCount: number;     // 当前 symbol 的累计交易序号
  amount: number;         // trade.amount = price × qty
  breakEvenPrice: number; // break-even
  realizedPnl: number;    // 本笔撮合产生的已实现盈亏
  quantityAfter: number;  // 撮合后（多为 +，空为 -）
  averageCost: number;    // 剩余头寸平均成本
};

/**
 * 仍然基于 FIFO 逐笔 enrich，逻辑与旧版一致，但使用纽约时区计算 weekday。
 */
export function computeFifo(trades: Trade[]): EnrichedTrade[] {
  const symbolStateMap: Record<string, SymbolState> = {};
  // New York “现在”
  const todayDateStr = toNYDate(Date.now()).toISOString().slice(0, 10);

  // 时间升序
  const sorted = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  return sorted.map((trade): EnrichedTrade => {
    const { symbol, price, quantity, action } = trade;
    const state =
      symbolStateMap[symbol] ||
      (symbolStateMap[symbol] = {
        longLots: [],
        shortLots: [],
        direction: 'NONE',
        accumulatedRealizedPnl: 0,
        tradeCount: 0,
      });
    state.tradeCount += 1;

    let realizedPnl = 0;
    const tradeDateStr = toNYDate(trade.date).toISOString().slice(0, 10);

    // ---- BUY / COVER ----
    if (action === 'buy' || action === 'cover') {
      let remaining = quantity;
      // 先平空
      while (remaining > EPSILON && state.shortLots.length) {
        const lot = state.shortLots[0]!;
        const matched = Math.min(remaining, lot.quantity);
        realizedPnl += (lot.price - price) * matched; // 空头回补
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= EPSILON) state.shortLots.shift();
      }
      // 多余部分作为新多头
      if (remaining > EPSILON) {
        state.longLots.push({
          price,
          quantity: remaining,
          openDate: tradeDateStr,
        });
        state.direction = 'LONG';
      } else if (!state.longLots.length && !state.shortLots.length) {
        state.direction = 'NONE';
      }
    }
    // ---- SELL / SHORT ----
    else if (action === 'sell' || action === 'short') {
      let remaining = quantity;
      // 先平多
      while (remaining > EPSILON && state.longLots.length) {
        const lot = state.longLots[0]!;
        const matched = Math.min(remaining, lot.quantity);
        realizedPnl += (price - lot.price) * matched; // 多头平仓
        lot.quantity -= matched;
        remaining -= matched;
        if (lot.quantity <= EPSILON) state.longLots.shift();
      }
      // 多余部分作为新空头
      if (remaining > EPSILON) {
        state.shortLots.push({
          price,
          quantity: remaining,
          openDate: tradeDateStr,
        });
        state.direction = 'SHORT';
      } else if (!state.longLots.length && !state.shortLots.length) {
        state.direction = 'NONE';
      }
    }

    state.accumulatedRealizedPnl += realizedPnl;

    // ------- 头寸统计 -------
    const allLots = [...state.longLots, ...state.shortLots];
    const totalQty = allLots.reduce((s, l) => s + l.quantity, 0);
    const cost = allLots.reduce((s, l) => s + l.price * l.quantity, 0);
    const averageCost = totalQty > EPSILON ? cost / totalQty : 0;
    const breakEvenPrice =
      totalQty > EPSILON
        ? (cost - state.accumulatedRealizedPnl) / totalQty
        : 0;

    // 纽约星期（Mon = 1）
    const nyDateObj = toNYDate(trade.date);
    const weekday = ((nyDateObj.getDay() + 6) % 7) + 1;

    return {
      ...trade,
      id: trade.id,
      weekday,
      tradeCount: state.tradeCount,
      amount: price * quantity,
      breakEvenPrice,
      realizedPnl,
      quantityAfter:
        state.direction === 'SHORT' ? -totalQty : totalQty,
      averageCost,
    };
  });
}

/** ---------- M1‑M13 指标计算 ---------- */

export interface TradingCount {
  B: number;
  S: number;
  P: number;
  C: number;
  total: number;
}

export interface DailyCloseRecord {
  date: string;      // 'YYYY-MM-DD'
  realized: number;  // 来自 M4
  unrealized: number;// 来自 M3
}

export interface Metrics {
  M1: number;
  M2: number;
  M3: number;
  M4: number;
  M5_1: number;
  M5_2: number;
  M6: number;
  M7: TradingCount;
  M8: TradingCount;
  M9: number;
  M10: { W: number; L: number; winRate: number };
  M11: number;
  M12: number;
  M13: number;
}

/**
 * 主计算函数：严格实现《M1‑M13 算法规则说明》
 * @param trades   全部交易记录
 * @param prices   { symbol: 实时价格 }，用于 M2 / M3
 * @param daily    历史每日盈亏快照，用于 M11‑M13
 */
export function computeMetrics(
  trades: Trade[],
  prices: Record<string, number>,
  daily: DailyCloseRecord[],
): Metrics {
  // 今日日期（纽约）
  const todayStr = toNYDate(Date.now()).toISOString().slice(0, 10);

  // 交易计数器初始化
  const initCount = (): TradingCount => ({ B: 0, S: 0, P: 0, C: 0, total: 0 });
  const todayCount = initCount();
  const totalCount = initCount();

  // 每 symbol 的 FIFO lots
  type Lots = { longs: PositionLot[]; shorts: PositionLot[] };
  const map: Record<string, Lots> = {};

  // 指标累加器
  let M4 = 0, M5_1 = 0, M5_2 = 0, M9 = 0;
  let W = 0, L = 0;

  // 排序
  const sorted = [...trades].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // 统一遍历
  sorted.forEach((t) => {
    const symbol = t.symbol;
    const price = t.price;
    let qty = t.quantity;
    const action = t.action.toLowerCase() as 'buy' | 'sell' | 'short' | 'cover';
    const tradeDateStr = toNYDate(t.date).toISOString().slice(0, 10);
    const isToday = tradeDateStr === todayStr;

    if (!map[symbol]) map[symbol] = { longs: [], shorts: [] };
    const pos = map[symbol];

    // count 更新
    const inc = (key: keyof TradingCount) => {
      totalCount[key] += 1;
      totalCount.total += 1;
      if (isToday) {
        todayCount[key] += 1;
        todayCount.total += 1;
      }
    };
    switch (action) {
      case 'buy': inc('B'); break;
      case 'sell': inc('S'); break;
      case 'short': inc('P'); break;
      case 'cover': inc('C'); break;
    }

    // ---- BUY / COVER ----
    if (action === 'buy' || action === 'cover') {
      // 先平空
      while (qty > EPSILON && pos.shorts.length) {
        const lot = pos.shorts[0]!;
        const matched = Math.min(qty, lot.quantity);
        const pnl = (lot.price - price) * matched; // 空回补

        // 分类：
        if (isToday && lot.openDate === todayStr) {
          // 今日开 ─ 今日平
          M5_1 += pnl;          // 行为视角
          M5_2 += pnl;          // FIFO 视角（成本同 lot.price）
        } else if (isToday) {
          // 今日平历史仓
          M4 += pnl;
        }
        M9 += pnl; // 历史累计
        if (pnl > EPSILON) W += 1;
        else if (pnl < -EPSILON) L += 1;

        lot.quantity -= matched;
        qty -= matched;
        if (lot.quantity <= EPSILON) pos.shorts.shift();
      }
      // 剩余量 → 新多头
      if (qty > EPSILON) {
        pos.longs.push({ price, quantity: qty, openDate: tradeDateStr });
      }
    }
    // ---- SELL / SHORT ----
    else if (action === 'sell' || action === 'short') {
      // 先平多
      while (qty > EPSILON && pos.longs.length) {
        const lot = pos.longs[0]!;
        const matched = Math.min(qty, lot.quantity);
        const pnl = (price - lot.price) * matched; // 多头平仓

        if (isToday && lot.openDate === todayStr) {
          M5_1 += pnl;
          M5_2 += pnl;
        } else if (isToday) {
          M4 += pnl;
        }
        M9 += pnl;
        if (pnl > EPSILON) W += 1;
        else if (pnl < -EPSILON) L += 1;

        lot.quantity -= matched;
        qty -= matched;
        if (lot.quantity <= EPSILON) pos.longs.shift();
      }
      // 剩余量 → 新空头
      if (qty > EPSILON) {
        pos.shorts.push({ price, quantity: qty, openDate: tradeDateStr });
      }
    }
  });

  // ---------- M1 / M2 / M3 ----------
  let M1 = 0, M2 = 0, M3 = 0;
  Object.entries(map).forEach(([symbol, lots]) => {
    const curPrice = prices[symbol] ?? 0;
    lots.longs.forEach((lot) => {
      M1 += lot.price * lot.quantity;
      M2 += curPrice * lot.quantity;
      M3 += (curPrice - lot.price) * lot.quantity;
    });
    lots.shorts.forEach((lot) => {
      M1 += lot.price * lot.quantity;
      M2 += curPrice * lot.quantity;
      M3 += (lot.price - curPrice) * lot.quantity;
    });
  });

  const M6 = M4 + M3;

  // ---------- M10 ----------
  const winRate = W + L > 0 ? (W / (W + L)) * 100 : 0;

  // ---------- M11 / M12 / M13 ----------
  // helper for range filter
  const toInt = (d: string) => parseInt(d.replace(/-/g, ''), 10);

  const todayNY = toNYDate(Date.now());
  const dayOfWeek = todayNY.getDay(); // 0=Sun
  const monday = new Date(todayNY);
  monday.setDate(todayNY.getDate() - ((dayOfWeek + 6) % 7));
  const firstOfMonth = new Date(todayNY.getFullYear(), todayNY.getMonth(), 1);
  const firstOfYear = new Date(todayNY.getFullYear(), 0, 1);
  const mondayStr = monday.toISOString().slice(0, 10);
  const firstOfMonthStr = firstOfMonth.toISOString().slice(0, 10);
  const firstOfYearStr = firstOfYear.toISOString().slice(0, 10);

  const sumRange = (start: string) =>
    daily
      .filter((d) => d.date >= start && d.date <= todayStr)
      .reduce((s, r) => s + r.realized + r.unrealized, 0);

  const M11 = sumRange(mondayStr);
  const M12 = sumRange(firstOfMonthStr);
  const M13 = sumRange(firstOfYearStr);

  return {
    M1,
    M2,
    M3,
    M4,
    M5_1,
    M5_2,
    M6,
    M7: todayCount,
    M8: totalCount,
    M9,
    M10: { W, L, winRate: Math.round(winRate * 10) / 10 }, // 保留 1 位小数
    M11,
    M12,
    M13,
  };
}
