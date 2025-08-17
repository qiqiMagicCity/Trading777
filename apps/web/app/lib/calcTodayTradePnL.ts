import type { EnrichedTrade } from "@/lib/fifo";
import { toNY } from "@/lib/timezone";

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
 * @param sortedTrades 已按时间排序的交易记录数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 日内交易盈亏
 */
export function calcTodayTradePnL(
  sortedTrades: EnrichedTrade[],
  todayStr: string,
): number {
  // 为多头和空头分别维护栈
  const longMap: Record<string, { qty: number; price: number }[]> = {};
  const shortMap: Record<string, { qty: number; price: number }[]> = {};
  let pnl = 0;

  for (const t of sortedTrades) {
    if (!isTodayNY(t.date, todayStr)) continue;
    const { symbol, action, price } = t;
    const quantity = Math.abs(t.quantity);

    if (!longMap[symbol]) longMap[symbol] = [];
    if (!shortMap[symbol]) shortMap[symbol] = [];

    if (action === "buy") {
      longMap[symbol].push({ qty: quantity, price });
    } else if (action === "sell") {
      const longStack = longMap[symbol];
      let remain = quantity;

      while (remain > 0 && longStack.length > 0) {
        const batch = longStack[0]!;
        const q = Math.min(batch.qty, remain);
        pnl += (price - batch.price) * q;
        batch.qty -= q;
        remain -= q;
        if (batch.qty === 0) longStack.shift();
      }
    } else if (action === "short") {
      shortMap[symbol].push({ qty: quantity, price });
    } else if (action === "cover") {
      const shortStack = shortMap[symbol];
      let remain = quantity;

      while (remain > 0 && shortStack.length > 0) {
        const batch = shortStack[0]!;
        const q = Math.min(batch.qty, remain);
        pnl += (batch.price - price) * q;
        batch.qty -= q;
        remain -= q;
        if (batch.qty === 0) shortStack.shift();
      }
    }
  }

  return pnl;
}

export default calcTodayTradePnL;
