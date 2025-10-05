import {
  nyDateStr,
  nyDateStrSafe,
  startOfWeekNY,
  startOfMonthNY,
  startOfYearNY,
  startOfDayNY,
  toNY,
} from './time';
import type { DailyResult } from './types';
import { selectLatestSnapshotsByNyDay } from './metrics-snapshot-selection';

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

type NormalizedDaily = {
  day: string;
  realized: number;
  unrealized?: number;
  unrealizedDelta?: number;
};

function normalizeDailyRows(daily: Daily[], endISO: string): NormalizedDaily[] {
  const latest = selectLatestSnapshotsByNyDay(daily, { maxNyDay: endISO });

  return latest.map(({ snapshot, nyDay }) => {
    const realized = Number((snapshot as any)?.realized ?? 0);
    const row: NormalizedDaily = {
      day: nyDay,
      realized: Number.isFinite(realized) ? realized : 0,
    };

    if (
      typeof (snapshot as any)?.unrealized === 'number' &&
      Number.isFinite((snapshot as any)?.unrealized)
    ) {
      row.unrealized = (snapshot as any).unrealized;
    }

    if (
      typeof (snapshot as any)?.unrealizedDelta === 'number' &&
      Number.isFinite((snapshot as any)?.unrealizedDelta)
    ) {
      row.unrealizedDelta = (snapshot as any).unrealizedDelta;
    }

    return row;
  });
}

function buildDailyPnlMap(
  daily: Daily[],
  rangeStart: string,
  rangeEnd: string,
): Map<string, number> {
  const normalized = normalizeDailyRows(daily, rangeEnd);
  const map = new Map<string, number>();
  let prevUnrealized: number | undefined;

  for (const row of normalized) {
    const { day, realized, unrealized, unrealizedDelta } = row;
    let delta = 0;

    if (typeof unrealizedDelta === 'number') {
      delta = unrealizedDelta;
    } else if (
      typeof unrealized === 'number' &&
      typeof prevUnrealized === 'number'
    ) {
      delta = unrealized - prevUnrealized;
    }

    if (day >= rangeStart && day <= rangeEnd) {
      map.set(day, (map.get(day) ?? 0) + realized + delta);
    }

    if (typeof unrealized === 'number') {
      prevUnrealized = unrealized;
    } else if (
      typeof unrealizedDelta === 'number' &&
      typeof prevUnrealized === 'number'
    ) {
      prevUnrealized = prevUnrealized + unrealizedDelta;
    }
  }

  return map;
}

function sumRange(map: Map<string, number>, startISO: string, endISO: string): number {
  if (!startISO || !endISO || startISO > endISO) return 0;
  let total = 0;
  let day = startISO;
  while (day <= endISO) {
    total += map.get(day) ?? 0;
    day = addDaysYmd(day, 1);
  }
  return total;
}

export function sumPeriod(daily: Daily[], startISO: string, endISO: string): number {
  const rangeStart = nyDateStrSafe(startISO);
  const rangeEnd = nyDateStrSafe(endISO);
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
    return 0;
  }

  const map = buildDailyPnlMap(daily, rangeStart, rangeEnd);
  return sumRange(map, rangeStart, rangeEnd);
}

function fillCalendar(
  map: Map<string, number>,
  rangeStart: string,
  rangeEnd: string,
): Map<string, number> {
  const filled = new Map<string, number>();
  let day = rangeStart;
  while (day <= rangeEnd) {
    filled.set(day, map.get(day) ?? 0);
    day = addDaysYmd(day, 1);
  }
  return filled;
}

function firstMondayOfYear(yearStart: string): string {
  const jan1 = toNY(`${yearStart}T12:00:00Z`);
  const offset = (8 - jan1.getDay()) % 7;
  return addDaysYmd(yearStart, offset);
}

function weekStartForEval(evalDay: string): string {
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;
  const firstMonday = firstMondayOfYear(yearStart);
  if (evalDay < firstMonday) {
    return yearStart;
  }
  const monday = nyDateStr(startOfWeekNY(`${evalDay}T12:00:00Z`));
  return monday < firstMonday ? firstMonday : monday;
}

export type PeriodTotalsOptions = {
  ytdMode?: 'fullYear' | 'toDate';
};

export function computeDailyPeriodTotals(
  daily: Daily[],
  evalDate: Date | string,
  options: PeriodTotalsOptions = {},
): {
  calendar: Map<string, number>;
  wtd: number;
  mtd: number;
  ytd: number;
  weekStart: string;
  monthStart: string;
  yearStart: string;
  yearEnd: string;
  ytdEnd: string;
  evalDay: string;
} {
  const evalDay = nyDateStr(evalDate);
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;
  const yearEnd = `${evalDay.slice(0, 4)}-12-31`;

  const baseMap = buildDailyPnlMap(daily, yearStart, yearEnd);
  const calendar = fillCalendar(baseMap, yearStart, yearEnd);

  const weekStart = weekStartForEval(evalDay);
  const monthStart = `${evalDay.slice(0, 7)}-01`;
  const yearEndForYtd =
    options.ytdMode === 'toDate' ? evalDay : yearEnd;

  const wtd = sumRange(calendar, weekStart, evalDay);
  const mtd = sumRange(calendar, monthStart, evalDay);
  const ytd = sumRange(calendar, yearStart, yearEndForYtd);

  return {
    calendar,
    wtd,
    mtd,
    ytd,
    weekStart,
    monthStart,
    yearStart,
    yearEnd,
    ytdEnd: yearEndForYtd,
    evalDay,
  };
}

export function computePeriods(daily: Daily[], evalDate: Date | string) {
  const evalDay = nyDateStr(evalDate);
  const { wtd, mtd, ytd } = computeDailyPeriodTotals(daily, evalDay);
  return {
    M9:  sumM9(daily, evalDay),
    M11: wtd,
    M12: mtd,
    M13: ytd,
  };
}
