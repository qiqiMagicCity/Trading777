import { nyDateStr } from './time';

export type EnrichedTrade = {
  symbol: string;
  action: 'buy' | 'sell' | 'short' | 'cover';
  price: number;
  quantity: number;   // 正数
  date: string;       // ISO string
};

type Lot = { qty: number; price: number; isToday: boolean };

export type M5Split = {
  trade: number;           // M5.1 交易视角（仅 today-闭环）
  fifo: number;            // M5.2 FIFO 视角（仅 today-闭环）
  historyRealized: number; // M4 今天历史平仓盈利
};

function realizedPnLLong(sell: number, cost: number, qty: number) {
  return (sell - cost) * qty;
}
function realizedPnLShort(short: number, cover: number, qty: number) {
  return (short - cover) * qty;
}

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
      let remain = t.quantity;
      const q = longQ.get(sym) ?? [];
      while (remain > 0 && q.length > 0) {
        const lot = q[0]!;
        const use = Math.min(remain, lot.qty);
        const pnl = realizedPnLLong(t.price, lot.price, use);
        if (lot.isToday) {
          // 行为视角与 FIFO 视角在“同一开仓批次”下金额相同
          m5_trade += pnl;
          m5_fifo  += pnl;
        } else {
          m4_hist += pnl;
        }
        lot.qty -= use;
        remain  -= use;
        if (lot.qty === 0) q.shift();
      }
      // 如果 remain > 0，说明出现“反向开仓”（数据异常或允许反向开新仓）
      // 这里不计入任何已实现值（它是新开仓），直接忽略剩余；也可以选择把它作为 SHORT 开仓，但非本任务重点。
      longQ.set(sym, q);
    } else if (t.action === 'cover') {
      let remain = t.quantity;
      const q = shortQ.get(sym) ?? [];
      while (remain > 0 && q.length > 0) {
        const lot = q[0]!;
        const use = Math.min(remain, lot.qty);
        const pnl = realizedPnLShort(lot.price, t.price, use);
        if (lot.isToday) {
          m5_trade += pnl;
          m5_fifo  += pnl;
        } else {
          m4_hist += pnl;
        }
        lot.qty -= use;
        remain  -= use;
        if (lot.qty === 0) q.shift();
      }
      shortQ.set(sym, q);
    }
  }

  // 保留两位小数在调用处处理，这里返回原值
  return { trade: m5_trade, fifo: m5_fifo, historyRealized: m4_hist };
}

