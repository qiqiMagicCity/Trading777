import { nyDateStr, startOfWeekNY, startOfMonthNY, startOfYearNY } from './time';

export type Daily = { date: string; realized: number; unrealized: number };

export function sumM9(daily: Daily[]): number {
  return (daily || []).reduce((s, d) => s + (d?.realized ?? 0), 0);
}

export function sumPeriod(daily: Daily[], startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return (daily || [])
    .filter(d => {
      const dt = new Date(d.date);
      return dt >= start && dt <= end;
    })
    .reduce((s, d) => s + (d?.realized ?? 0) + (d?.unrealized ?? 0), 0);
}

export function computePeriods(daily: Daily[], evalDate: Date | string) {
  const endISO = nyDateStr(evalDate);
  const w0 = nyDateStr(startOfWeekNY(evalDate));
  const m0 = nyDateStr(startOfMonthNY(evalDate));
  const y0 = nyDateStr(startOfYearNY(evalDate));
  return {
    M9:  sumM9(daily),
    M11: sumPeriod(daily, w0, endISO),
    M12: sumPeriod(daily, m0, endISO),
    M13: sumPeriod(daily, y0, endISO),
  };
}
