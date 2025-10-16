import { resolveTradingDayStr, isTradingDay as isTradingDayYmd, ymdInNY } from "@/app/lib/nyDay";

const HALF_DAY_CLOSE_MINUTES = 13 * 60;
const REGULAR_CLOSE_MINUTES = 16 * 60;

type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

type ParsedYmd = {
  year: number;
  month: MonthIndex;
  day: number;
};

function parseYmd(ymd: string): ParsedYmd {
  const [yearStr, monthStr, dayStr] = ymd.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10) as MonthIndex;
  const day = Number.parseInt(dayStr, 10);
  return { year, month, day };
}

function toUtcDate(parsed: ParsedYmd): Date {
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
}

function isWeekday(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function nthWeekdayOfMonth(date: Date): number {
  const dayOfMonth = date.getUTCDate();
  return Math.floor((dayOfMonth - 1) / 7) + 1;
}

function isThanksgiving(date: Date): boolean {
  return (
    date.getUTCMonth() === 10 &&
    date.getUTCDay() === 4 &&
    nthWeekdayOfMonth(date) === 4
  );
}

function isDayAfterThanksgiving(date: Date): boolean {
  const previous = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return isThanksgiving(previous) && date.getUTCDay() === 5;
}

function isDayBeforeIndependenceDay(date: Date): boolean {
  const next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return (
    next.getUTCMonth() === 6 &&
    next.getUTCDate() === 4 &&
    isWeekday(date)
  );
}

function isChristmasEve(date: Date): boolean {
  return date.getUTCMonth() === 11 && date.getUTCDate() === 24 && isWeekday(date);
}

function isHalfDay(ymd: string): boolean {
  const parsed = parseYmd(ymd);
  const date = toUtcDate(parsed);
  return (
    isDayAfterThanksgiving(date) ||
    isDayBeforeIndependenceDay(date) ||
    isChristmasEve(date)
  );
}

export function pickEvaluationDay(nowNY: Date): string {
  return resolveTradingDayStr(nowNY);
}

export function isTradingDay(nowNY: Date): boolean {
  const ymd = ymdInNY(nowNY);
  return isTradingDayYmd(ymd);
}

export function beforeOfficialClose(nowNY: Date): boolean {
  const ymd = ymdInNY(nowNY);
  if (!isTradingDayYmd(ymd)) {
    return false;
  }

  const closeMinutes = isHalfDay(ymd) ? HALF_DAY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;
  const currentMinutes = nowNY.getHours() * 60 + nowNY.getMinutes();
  return currentMinutes < closeMinutes;
}
