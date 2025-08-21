import { nyDateStr } from './time';
import { consumeLots, type Lot } from './fifo-engine';
import { realizedPnLLong, realizedPnLShort } from './money';

export type EnrichedTrade = {
  symbol: string;
  action: 'buy' | 'sell' | 'short' | 'cover';
  price: number;
  quantity: number;   // 正数
  date: string;       // ISO string
};


export type M5Split = {
  trade: number;           // M5.1 交易视角（仅 today-闭环）
  fifo: number;            // M5.2 FIFO 视角（仅 today-闭环）
  historyRealized: number; // M4 今天历史平仓盈利
};

/**
 * 核心：在“全历史 FIFO 队列”上配对，但只把 isToday=true 的开仓配对部分计入 M5；
 * 其余（历史开仓配对的部分）计入 M4。
 */
export function calcM5Split(
  enriched: EnrichedTrade[],
  evalISO: string,
  initial: { symbol: string; qty: number; avgPrice: number }[] = [],
): M5Split {
  // 队列：每个 symbol 各两套 FIFO（多头/空头）
  const longQ = new Map<string, Lot[]>();   // from BUY
  const shortQ = new Map<string, Lot[]>();  // from SHORT

  // 先将历史持仓注入队列
  for (const p of initial) {
    if (p.qty > 0) {
      const q = longQ.get(p.symbol) ?? [];
      q.push({ qty: p.qty, price: p.avgPrice, isToday: false });
      longQ.set(p.symbol, q);
    } else if (p.qty < 0) {
      const q = shortQ.get(p.symbol) ?? [];
      q.push({ qty: -p.qty, price: p.avgPrice, isToday: false });
      shortQ.set(p.symbol, q);
    }
  }

  const isToday = (d: string) => nyDateStr(d) === evalISO;

  let m5_trade = 0;
  let m5_fifo = 0;
  let m4_hist = 0;

  for (const t of enriched) {
    const sym = t.symbol;
    const today = isToday(t.date);

    if (t.action === 'buy') {
      const q = longQ.get(sym) ?? [];
      q.push({ qty: t.quantity, price: t.price, isToday: today });
      longQ.set(sym, q);
    } else if (t.action === 'short') {
      const q = shortQ.get(sym) ?? [];
      q.push({ qty: t.quantity, price: t.price, isToday: today });
      shortQ.set(sym, q);
    } else if (t.action === 'sell') {
      const q = longQ.get(sym) ?? [];
      const _remain = consumeLots(q, t.quantity, (use, lot) => {
        const pnl = realizedPnLLong(t.price, lot.price, use);
        if (lot.isToday) { m5_trade += pnl; m5_fifo += pnl; } else { m4_hist += pnl; }
      });
      void _remain;
      // remain>0 代表反向开仓，当前策略：忽略（不计已实现），保持与原实现一致
      longQ.set(sym, q);
    } else if (t.action === 'cover') {
      const q = shortQ.get(sym) ?? [];
      const _remain = consumeLots(q, t.quantity, (use, lot) => {
        const pnl = realizedPnLShort(lot.price, t.price, use);
        if (lot.isToday) { m5_trade += pnl; m5_fifo += pnl; } else { m4_hist += pnl; }
      });
      void _remain;
      shortQ.set(sym, q);
    }
  }

  // 保留两位小数在调用处处理，这里返回原值
  return { trade: m5_trade, fifo: m5_fifo, historyRealized: m4_hist };
}

