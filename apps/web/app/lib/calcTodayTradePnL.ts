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
 * @param enrichedTrades 交易记录数组
 * @param todayStr 今日日期字符串，格式为 YYYY-MM-DD
 * @returns 日内交易盈亏
 */
export function calcTodayTradePnL(enrichedTrades: EnrichedTrade[], todayStr: string): number {
  // 为多头和空头分别维护栈
  const longMap: Record<string, { qty: number; price: number }[]> = {};
  const shortMap: Record<string, { qty: number; price: number }[]> = {};
  let pnl = 0;

  const sorted = enrichedTrades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => isTodayNY(t.date, todayStr))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
  for (const t of sorted) {
      const { symbol, action, price } = t;
      const quantity = Math.abs(t.quantity);

      // 初始化栈
      if (!longMap[symbol]) longMap[symbol] = [];
      if (!shortMap[symbol]) shortMap[symbol] = [];

      if (action === 'buy') {
        // 买入：直接加入多头栈
        longMap[symbol].push({ qty: quantity, price });
      }
      else if (action === 'sell') {
        // 卖出：匹配今日多头栈
        const longStack = longMap[symbol];
        let remain = quantity;

        while (remain > 0 && longStack.length > 0) {
          const batch = longStack[0]!;
          const q = Math.min(batch.qty, remain);
          // 多头平仓：卖出价 > 买入价 = 盈利
          pnl += (price - batch.price) * q;
          batch.qty -= q;
          remain -= q;
          if (batch.qty === 0) longStack.shift();
        }

        // 剩余的不处理（可能是平历史仓位，不计入日内交易）
      }
      else if (action === 'short') {
        // 做空：直接加入空头栈
        shortMap[symbol].push({ qty: quantity, price });
      }
      else if (action === 'cover') {
        // 回补：匹配今日空头栈
        const shortStack = shortMap[symbol];
        let remain = quantity;

        while (remain > 0 && shortStack.length > 0) {
          const batch = shortStack[0]!;
          const q = Math.min(batch.qty, remain);
          // 空头平仓：回补价 < 做空价 = 盈利
          pnl += (batch.price - price) * q;
          batch.qty -= q;
          remain -= q;
          if (batch.qty === 0) shortStack.shift();
        }

        // 剩余的不处理（可能是平历史仓位，不计入日内交易）
      }
    }

  return pnl;
}

export default calcTodayTradePnL;
