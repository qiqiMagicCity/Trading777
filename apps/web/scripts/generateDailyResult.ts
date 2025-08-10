import type { EnrichedTrade } from '../app/lib/fifo';
import { calcTodayTradePnL } from '../app/lib/calcTodayTradePnL';
import { calcTodayFifoPnL } from '../app/lib/metrics';
import type { DailyResult } from '../app/lib/types';

/**
 * 根据交易记录生成某日的汇总结果
 * 复用前端算法计算日内交易与 FIFO 盈亏
 */
export function generateDailyResult(
  trades: EnrichedTrade[],
  date: string,
): DailyResult {
  const realizedPnl = trades
    // Ensure trade has a valid date before checking prefix
    .filter((t) => t.date?.startsWith(date))
    .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const m5Trade = calcTodayTradePnL(trades, date);
  const m5Fifo = calcTodayFifoPnL(trades, date);

  return {
    date,
    realized: realizedPnl - m5Trade + m5Fifo,
    unrealized: 0, // 浮动盈亏由外部价格数据计算，此处置零占位
  };
}
