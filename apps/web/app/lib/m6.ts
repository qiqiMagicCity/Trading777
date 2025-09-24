/**
 * M6（当日总变化）计算工具。
 *
 * 公式：
 *   M6 = M4_today + M5FIFO_today + Σ (P_now - P_prevClose) * Q_prev
 *
 * 说明：
 * - M4_today：今日对“昨持仓”进行平仓所产生的已实现盈亏。
 * - M5FIFO_t：今天按 FIFO 配对产生的已实现盈亏（含回转 / 部分平仓）。
 * - Q_prev：昨收时刻的净持仓数量（多头为正，空头为负）。
 * - P_prevClose / P_now：昨收价与当前估值价，只有同时存在时才计入 MTM。
 */

export interface PrevPosition {
  symbol: string;
  /** 昨收时刻的净持仓数量（多头为正、空头为负） */
  qtyPrev: number;
  /** 可选：昨收基准货币 */
  ccy?: string;
}

export interface QuoteNowPrev {
  symbol: string;
  /** 当前估值价格（可为实时价、盘中价或收盘价） */
  now?: number;
  /** 昨日收盘价 */
  prevClose?: number;
  /** 若存在多币种，提供 FX（报价货币 → 组合货币）的换算率 */
  fxNow?: number;
  fxPrevClose?: number;
}

export interface ComputeM6Input {
  /** 今日针对昨持仓的已实现盈亏（即 M4.total） */
  m4Today: number;
  /** 今日 FIFO 已实现盈亏（含回转 / 部分平仓） */
  m5FifoToday: number;
  /** 昨收后的净持仓快照 */
  prevPositions: PrevPosition[];
  /** 当日估值所用行情（覆盖部分或全部昨收持仓标的） */
  quotes: QuoteNowPrev[];
  portfolioCcy?: string;
}

export interface ComputeM6Result {
  /** 最终 M6 数值 */
  m6: number;
  /** Σ (now - prevClose) * qtyPrev —— 当日 MTM */
  mtmSum: number;
  m4Today: number;
  m5FifoToday: number;
  legs: Array<{
    symbol: string;
    qtyPrev: number;
    prevClose: number;
    now: number;
    pxDiffInPortfolioCcy: number;
    mtm: number;
  }>;
  excluded: Array<{
    symbol: string;
    reason: "NO_NOW" | "NO_PREV_CLOSE" | "ZERO_QTY";
  }>;
}

export function computeM6(input: ComputeM6Input): ComputeM6Result {
  const { m4Today, m5FifoToday, prevPositions, quotes } = input;

  const quoteMap = new Map<string, QuoteNowPrev>();
  for (const q of quotes) quoteMap.set(q.symbol, q);

  const legs: ComputeM6Result["legs"] = [];
  const excluded: ComputeM6Result["excluded"] = [];
  let mtmSum = 0;

  for (const pos of prevPositions) {
    const qtyPrev = pos.qtyPrev ?? 0;
    if (!Number.isFinite(qtyPrev) || qtyPrev === 0) {
      excluded.push({ symbol: pos.symbol, reason: "ZERO_QTY" });
      continue;
    }

    const quote = quoteMap.get(pos.symbol);
    if (!quote) {
      excluded.push({ symbol: pos.symbol, reason: "NO_NOW" });
      continue;
    }

    const now = quote.now;
    if (typeof now !== "number" || !Number.isFinite(now)) {
      excluded.push({ symbol: pos.symbol, reason: "NO_NOW" });
      continue;
    }

    const prevClose = quote.prevClose;
    if (typeof prevClose !== "number" || !Number.isFinite(prevClose)) {
      excluded.push({ symbol: pos.symbol, reason: "NO_PREV_CLOSE" });
      continue;
    }

    const fxNow =
      typeof quote.fxNow === "number" && Number.isFinite(quote.fxNow) ? quote.fxNow : 1;
    const fxPrev =
      typeof quote.fxPrevClose === "number" && Number.isFinite(quote.fxPrevClose)
        ? quote.fxPrevClose
        : 1;

    const pxDiffInPortfolioCcy = now * fxNow - prevClose * fxPrev;
    const mtm = pxDiffInPortfolioCcy * qtyPrev;
    mtmSum += mtm;

    legs.push({
      symbol: pos.symbol,
      qtyPrev,
      prevClose,
      now,
      pxDiffInPortfolioCcy,
      mtm,
    });
  }

  const m6 = m4Today + m5FifoToday + mtmSum;

  return {
    m6,
    mtmSum,
    m4Today,
    m5FifoToday,
    legs,
    excluded,
  };
}
