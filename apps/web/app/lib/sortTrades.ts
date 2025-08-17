import type { EnrichedTrade } from "@/lib/fifo";
import { toNY } from "@/lib/timezone";

/**
 * Sort trades chronologically by their date field.
 * Invalid dates are placed at the end while preserving original order.
 */
export function sortTrades(trades: EnrichedTrade[]): EnrichedTrade[] {
  return trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
}

export default sortTrades;
