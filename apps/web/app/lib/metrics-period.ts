import type { DailyResult } from "./types";
// Deprecated utilities retained for backward compatibility

export function sumRealized(days: Pick<DailyResult, "realized">[]): number {
  return days.reduce((total, d) => total + d.realized, 0);
}


