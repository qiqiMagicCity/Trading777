import {
  nyDateStr,
  nyDateStrSafe,
  startOfWeekNY,
  startOfMonthNY,
  startOfYearNY,
  startOfDayNY,
} from './time';
import { sumPeriodCached } from './period-sum-cache';
import type { DailyResult } from './types';

export type Daily = Pick<
  DailyResult,
  'date' | 'realized' | 'unrealized' | 'unrealizedDelta'
>;

export function sumM9(daily: Daily[], endISO?: string): number {
  return (daily || []).reduce((s, d) => {
    if (endISO && d?.date) {
      const dt = new Date(d.date);
      if (Number.isFinite(dt.valueOf())) {
        const day = typeof d.date === 'string' ? nyDateStrSafe(d.date) : nyDateStr(dt);
        if (day > endISO) return s;
      }
    }
    return s + (d?.realized ?? 0);
  }, 0);
}

export function sumPeriod(daily: Daily[], startISO: string, endISO: string): number {
  const start = startOfDayNY(startISO).getTime();
  const end = startOfDayNY(endISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return 0;

  const sorted = (daily || [])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let total = 0;
  let prevUnrealized = 0;

  for (const d of sorted) {
    if (!d?.date) continue;
    const dt = new Date(d.date);
    if (!Number.isFinite(dt.valueOf())) continue;
    const dayTS = startOfDayNY(dt).getTime();
    if (!Number.isFinite(dayTS)) continue;

    const unrealized = d?.unrealized ?? 0;
    const delta =
      typeof d?.unrealizedDelta === 'number'
        ? d.unrealizedDelta
        : unrealized - prevUnrealized;

    if (dayTS >= start && dayTS <= end) {
      total += (d?.realized ?? 0) + delta;
    }

    prevUnrealized = unrealized;
    if (dayTS > end) break;
  }

  return total;
}

export function computePeriods(daily: Daily[], evalDate: Date | string) {
  const endISO = nyDateStr(evalDate);
  const w0 = nyDateStr(startOfWeekNY(evalDate));
  const m0 = nyDateStr(startOfMonthNY(evalDate));
  const y0 = nyDateStr(startOfYearNY(evalDate));
  return {
    M9:  sumM9(daily, endISO),
    M11: sumPeriodCached(daily, w0, endISO),
    M12: sumPeriodCached(daily, m0, endISO),
    M13: sumPeriodCached(daily, y0, endISO),
  };
}
