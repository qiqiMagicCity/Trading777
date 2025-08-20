export type Lot = { qty: number; price: number; isToday?: boolean };

/**
 * 从 FIFO 队列前端消费 demand 数量；每次匹配回调 cb(useQty, lot)。
 * 返回未满足的剩余数量（>0 表示溢出，上层自行决定如何处理）。
 */
export function consumeLots(
  lots: Lot[],
  demand: number,
  cb: (useQty: number, lot: Lot) => void
): number {
  let remain = demand;
  while (remain > 0 && lots.length > 0) {
    const lot = lots[0]!;
    const use = Math.min(remain, lot.qty);
    if (use > 0) cb(use, lot);
    lot.qty -= use;
    remain -= use;
    if (lot.qty === 0) lots.shift();
  }
  return remain;
}
