import {
  nyDateStr,
  nyDateStrSafe,
  startOfWeekNY,
  startOfMonthNY,
  startOfYearNY,
  startOfDayNY,
  toNY,
} from './time';
import type { DailyResult, DailyResultInput } from './types';
import { selectLatestSnapshotsByNyDay } from './metrics-snapshot-selection';
import {
  parseSnapshotNumber,
  type SnapshotFieldParseError,
  type SnapshotNumericField,
} from './snapshotNumber';

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type Daily = Pick<
  DailyResultInput,
  'date' | 'realized' | 'unrealized' | 'unrealizedDelta'
>;

export function sumM9(daily: Daily[], endISO?: string): number {
  let hasParseFailure = false;
  const total = (daily || []).reduce((s, d) => {
    if (endISO && d?.date) {
      const dt = new Date(d.date);
      if (Number.isFinite(dt.valueOf())) {
        const day = typeof d.date === 'string' ? nyDateStrSafe(d.date) : nyDateStr(dt);
        if (day > endISO) return s;
      }
    }
    const parsed = parseSnapshotNumber(d?.realized);
    if (!parsed.ok) {
      hasParseFailure = true;
      return s;
    }
    return s + parsed.value;
  }, 0);
  return hasParseFailure ? Number.NaN : total;
}

type NormalizedDaily = {
  day: string;
  realized: number;
  unrealized?: number;
  unrealizedDelta?: number;
  parseErrors?: SnapshotFieldParseError[];
};

function normalizeDailyRows(daily: Daily[], endISO: string): NormalizedDaily[] {
  const latest = selectLatestSnapshotsByNyDay(daily, { maxNyDay: endISO });

  return latest.map(({ snapshot, nyDay }) => {
    const inheritedErrors = Array.isArray((snapshot as any)?.parseErrors)
      ? ((snapshot as any).parseErrors as SnapshotFieldParseError[])
          .filter((err) => err && typeof err === "object")
          .map((err) => ({ ...err, day: err.day ?? nyDay }))
      : [];

    const parseErrors: SnapshotFieldParseError[] = [...inheritedErrors];

    const parseField = (
      field: SnapshotNumericField,
      value: unknown,
      { optional = false }: { optional?: boolean } = {},
    ): number | undefined => {
      if (optional && (value === null || value === undefined)) {
        return undefined;
      }
      const parsed = parseSnapshotNumber(value);
      if (parsed.ok) {
        return parsed.value;
      }
      parseErrors.push({ ...parsed.error, field, day: nyDay });
      return undefined;
    };

    const realizedValue = parseField('realized', (snapshot as any)?.realized);
    const row: NormalizedDaily = {
      day: nyDay,
      realized: realizedValue ?? 0,
    };

    const unrealizedValue = parseField('unrealized', (snapshot as any)?.unrealized);
    if (typeof unrealizedValue === 'number') {
      row.unrealized = unrealizedValue;
    }

    const unrealizedDeltaValue = parseField(
      'unrealizedDelta',
      (snapshot as any)?.unrealizedDelta,
      { optional: true },
    );
    if (typeof unrealizedDeltaValue === 'number') {
      row.unrealizedDelta = unrealizedDeltaValue;
    }

    if (parseErrors.length > 0) {
      row.parseErrors = parseErrors;
    }

    return row;
  });
}

function buildDailyPnlMap(
  daily: Daily[],
  rangeStart: string,
  rangeEnd: string,
): { map: Map<string, number>; hasParseFailure: boolean } {
  const normalized = normalizeDailyRows(daily, rangeEnd);
  const map = new Map<string, number>();
  let prevUnrealized: number | undefined;
  let hasParseFailure = false;

  for (const row of normalized) {
    const { day, realized, unrealized, unrealizedDelta } = row;
    if (row.parseErrors?.length) {
      hasParseFailure = true;
    }
    let delta = 0;

    if (typeof unrealizedDelta === 'number') {
      delta = unrealizedDelta;
    } else if (
      typeof unrealized === 'number' &&
      typeof prevUnrealized === 'number'
    ) {
      delta = unrealized - prevUnrealized;
    } else if (
      row.parseErrors?.some((err) =>
        err.field === 'unrealized' || err.field === 'unrealizedDelta'
      )
    ) {
      hasParseFailure = true;
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

  return { map, hasParseFailure };
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

  const { map, hasParseFailure } = buildDailyPnlMap(daily, rangeStart, rangeEnd);
  if (hasParseFailure) {
    return Number.NaN;
  }
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

  const { map: baseMap, hasParseFailure } = buildDailyPnlMap(
    daily,
    yearStart,
    yearEnd,
  );
  const calendar = fillCalendar(baseMap, yearStart, yearEnd);

  const weekStart = weekStartForEval(evalDay);
  const monthStart = `${evalDay.slice(0, 7)}-01`;
  const yearEndForYtd =
    options.ytdMode === 'toDate' ? evalDay : yearEnd;

  const wtd = hasParseFailure
    ? Number.NaN
    : sumRange(calendar, weekStart, evalDay);
  const mtd = hasParseFailure
    ? Number.NaN
    : sumRange(calendar, monthStart, evalDay);
  const ytd = hasParseFailure
    ? Number.NaN
    : sumRange(calendar, yearStart, yearEndForYtd);

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
