import { toNY } from '@/lib/timezone';

export type YMD = { y: number; m: number; d: number };

export const TRADING_TZ = 'America/New_York';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toET(date?: Date | string | number): Date {
  if (date === undefined) {
    return toNY();
  }
  if (date instanceof Date) {
    return toNY(date);
  }
  return toNY(date);
}

function ymdOf(d: Date): YMD {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

function at0930ET(d: Date): Date {
  const t = new Date(d.getTime());
  t.setHours(9, 30, 0, 0);
  return t;
}

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

function addDays(d: Date, delta: number): Date {
  const t = new Date(d.getTime());
  t.setDate(t.getDate() + delta);
  return t;
}

function prevBusinessDayET(from: Date): Date {
  let t = addDays(from, -1);
  while (isWeekend(t)) {
    t = addDays(t, -1);
  }
  return t;
}

export function getTradingDateYMD(now?: Date | string | number): YMD {
  const nowET = toET(now);
  if (isWeekend(nowET)) {
    return ymdOf(prevBusinessDayET(nowET));
  }
  const cut = at0930ET(nowET);
  if (nowET.getTime() < cut.getTime()) {
    return ymdOf(prevBusinessDayET(nowET));
  }
  return ymdOf(nowET);
}

export function ymdStr(ymd: YMD): string {
  const mm = String(ymd.m).padStart(2, '0');
  const dd = String(ymd.d).padStart(2, '0');
  return `${ymd.y}-${mm}-${dd}`;
}

export function getTradingDateStr(now?: Date | string | number): string {
  return ymdStr(getTradingDateYMD(now));
}

export function resolveTradingDateStr(input?: Date | string | number): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return getTradingDateStr();
    }
    if (DATE_ONLY_RE.test(trimmed)) {
      return trimmed;
    }
    const parsed = toET(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getTradingDateStr(parsed);
    }
    return getTradingDateStr();
  }
  if (input instanceof Date || typeof input === 'number') {
    const parsed = toET(input);
    if (!Number.isNaN(parsed.getTime())) {
      return getTradingDateStr(parsed);
    }
  }
  return getTradingDateStr();
}
