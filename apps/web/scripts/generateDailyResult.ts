import type { EnrichedTrade } from "../app/lib/fifo";
import type { Position } from "../app/lib/services/dataService";
import type { DailyResult } from "../app/lib/types";

/**
 * 根据交易记录与持仓生成某日的汇总结果
 *
 * realized: 直接汇总当天所有交易的 realizedPnl
 * unrealized: 根据持仓计算 M3 浮动盈亏
*/
export function generateDailyResult(
  trades: EnrichedTrade[],
  positions: Position[],
  date: string,
  prevUnrealized = 0,
): DailyResult {
  const realized = trades
    // Ensure trade has a valid date before checking prefix
    .filter((t) => t.date?.startsWith(date))
    .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

  const unrealized = positions.reduce((acc, pos) => {
    const qty = Math.abs(pos.qty);
    if (pos.qty >= 0) {
      // 多头: (市价 - 均价) * 数量
      return acc + (pos.last - pos.avgPrice) * qty;
    }
    // 空头: (均价 - 市价) * 数量
    return acc + (pos.avgPrice - pos.last) * qty;
  }, 0);

  return {
    date,
    realized,
    unrealized,
    unrealizedDelta: unrealized - prevUnrealized,
  };
}
