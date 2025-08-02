import type { EnrichedTrade } from '../app/lib/fifo';
import { calcTodayTradePnL } from '../app/lib/calcTodayTradePnL';
import type { DailyResult } from '../app/lib/metrics';

/**
 * 根据交易记录生成某日的汇总结果
 * 包含新增的 M5_1 字段，复用前端算法 calcTodayTradePnL
 */
export function generateDailyResult(trades: EnrichedTrade[], date: string): DailyResult {
  const realized = trades
    // Ensure trade has a valid date before checking prefix
    .filter(t => t.date?.startsWith(date))
    .reduce((acc, t) => acc + (t.realizedPnl || 0), 0);

  const float = 0; // 浮动盈亏由外部价格数据计算，此处置零占位
  const M5_1 = calcTodayTradePnL(trades, date);

  return {
    date,
    realized,
    float,
    M5_1,
    pnl: realized + float,
  };
}
