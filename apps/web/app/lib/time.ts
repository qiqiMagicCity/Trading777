import {
  fromZonedTime as zonedTimeToUtc,
  toZonedTime as utcToZonedTime,
  formatInTimeZone,
} from 'date-fns-tz';
import { startOfWeek, startOfMonth, startOfYear } from 'date-fns';

export const NY_TZ = 'America/New_York';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_ISO_RE =
  /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

/** 将任意时间映射为纽约时区的 YYYY-MM-DD 字符串 */
export function toETYYYYMMDD(d: Date | string | number): string {
  return formatInTimeZone(d, NY_TZ, 'yyyy-MM-dd');
}

export function toNY(d: Date | string | number): Date {
  const dt = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return utcToZonedTime(dt, NY_TZ);
}

export function isSameNYDay(a: Date | string | number, b: Date | string | number): boolean {
  const A = toNY(a); const B = toNY(b);
  return A.getFullYear() === B.getFullYear()
    && A.getMonth() === B.getMonth()
    && A.getDate() === B.getDate();
}

export function nyDateStr(d: Date | string | number): string {
  return toETYYYYMMDD(d);
}

export function normalizeToNyDay(
  input: Date | string | number,
): Date | string | number {
  if (typeof input === 'string') {
    if (DATE_ONLY_RE.test(input)) {
      return `${input}T12:00:00Z`;
    }

    const midnightMatch = input.match(MIDNIGHT_ISO_RE);
    if (midnightMatch) {
      const [, datePart] = midnightMatch;
      return `${datePart}T12:00:00Z`;
    }
  }

  return input;
}

export function nyDateStrSafe(d: Date | string | number): string {
  return toETYYYYMMDD(normalizeToNyDay(d));
}

export function startOfDayNY(d: Date | string | number): Date {
  const nd = toNY(d);
  const local = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), 0, 0, 0);
  return zonedTimeToUtc(local, NY_TZ);
}

export function startOfWeekNY(d: Date | string | number): Date {
  const nd = toNY(d);
  const mondayLocal = startOfWeek(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()), { weekStartsOn: 1 });
  return zonedTimeToUtc(mondayLocal, NY_TZ);
}

export function startOfMonthNY(d: Date | string | number): Date {
  const nd = toNY(d);
  const m0Local = startOfMonth(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()));
  return zonedTimeToUtc(m0Local, NY_TZ);
}

export function startOfYearNY(d: Date | string | number): Date {
  const nd = toNY(d);
  const y0Local = startOfYear(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()));
  return zonedTimeToUtc(y0Local, NY_TZ);
}
