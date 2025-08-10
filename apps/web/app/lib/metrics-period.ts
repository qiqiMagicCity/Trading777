import type { DailyResult } from "./types";
import { weekStartNY, monthStartNY, yearStartNY } from "./timezone";

export function sumRealized(days: Pick<DailyResult, "realized">[]): number {
  return days.reduce((total, d) => total + d.realized, 0);
}

export function calcPeriodMetrics(
  days: DailyResult[],
  currentNyDate: string,
): { wtd: number; mtd: number; ytd: number } {
  const sum = (from: string) =>
    days
      .filter((r) => r.date >= from && r.date <= currentNyDate)
      .reduce((acc, r) => acc + r.realized + r.unrealized, 0);

  return {
    wtd: sum(weekStartNY(currentNyDate)),
    mtd: sum(monthStartNY(currentNyDate)),
    ytd: sum(yearStartNY(currentNyDate)),
  };
}

