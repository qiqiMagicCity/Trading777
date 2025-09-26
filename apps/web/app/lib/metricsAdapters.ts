import type { SummaryMetrics } from "./types/metrics";

export function adaptSummaryForUI(summary: SummaryMetrics) {
  const safeNumber = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  return {
    todayTotalPnl: safeNumber(summary?.M6),
    todayRealized: safeNumber(summary?.M4),
    todayIntradayUnrealized: safeNumber(summary?.M5_2),
    tradingDateStr: summary?.tradingDateStr,
  };
}
