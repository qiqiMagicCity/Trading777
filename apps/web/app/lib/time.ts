import { fromZonedTime as zonedTimeToUtc, toZonedTime as utcToZonedTime, formatInTimeZone } from 'date-fns-tz';
import { startOfWeek, startOfMonth, startOfYear } from 'date-fns';

export const NY_TZ = 'America/New_York';

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
  return formatInTimeZone(d, NY_TZ, 'yyyy-MM-dd');
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
