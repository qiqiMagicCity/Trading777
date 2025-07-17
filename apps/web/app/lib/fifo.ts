// apps/web/app/lib/fifo.ts
import { Trade } from './types';

export interface Batch {
  side: 'LONG' | 'SHORT';
  qty: number;
  openPrice: number;
  closePrice: number;
  realizedPnl: number;
  openTime: Date;
  closeTime: Date;
}

/**
 * 将一串成交记录拆成 FIFO 批次
 * @param trades 已按时间升序
 */
export function fifo(trades: Trade[]): Batch[] {
  const opens: Trade[] = [];
  const batches: Batch[] = [];

  for (const t of trades) {
    if (t.positionEffect === 'OPEN') {
      // 深拷贝开仓交易到队列
      opens.push({ ...t });
      continue;
    }

    // CLOSE: 按 FIFO 依次消耗 opens
    let qtyLeft = t.qty;
    while (qtyLeft > 0 && opens.length > 0) {
      const head = opens[0];
      const matchedQty = Math.min(qtyLeft, head.qty);

      // 计算方向与已实现盈亏
      const side = head.side === 'BUY' ? 'LONG' : 'SHORT';
      const realizedPnl =
        (t.price - head.price) * matchedQty * (side === 'LONG' ? 1 : -1);

      batches.push({
        side,
        qty: matchedQty,
        openPrice: head.price,
        closePrice: t.price,
        realizedPnl,
        openTime: head.time,
        closeTime: t.time,
      });

      // 更新开仓量与剩余平仓量
      head.qty -= matchedQty;
      qtyLeft -= matchedQty;
      if (head.qty === 0) {
        opens.shift();
      }
    }

    if (qtyLeft > 0) {
      throw new Error(
        `FIFO Error: 平仓量 ${t.qty} 超过未平仓量，剩余量 ${qtyLeft}`
      );
    }
  }

  return batches;
}
