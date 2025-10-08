/**
* NY Trading-Day Authority (Step 1: Scaffold Only)
* 说明：
* - 本模块作为“纽约交易日”的统一对外入口（后续所有层将逐步改为只依赖这里）。
* - 本步仅封装/转发到现有工具，不改变任何既有行为；后续步骤再慢慢迁移调用方与细节。
*/

export const NY_TZ = 'America/New_York' as const;

export type ResolveOpts = {
  /** 冻结为指定纽约交易日（YYYY-MM-DD）；若提供则优先返回该值 */
  freeze?: string;
};

// 复用现有实现（保持行为一致）
import { getLatestTradingDayStr as _latestTradingDayStr, ymdInNY as _ymdInNY } from './timezone';
import { getTradingDateStr as _calendarTradingDayStr } from './tradingDay';
import { isNyseHoliday, isWeekend } from './nyseHolidays';
import { toNY } from './time';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_RE = YMD_RE;
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const ADHOC_CLOSED_DATES = new Set<string>();

type CanonicalYmd = string;

function isoDateFromYmd(ymd: CanonicalYmd): Date {
  if (!DATE_ONLY_RE.test(ymd)) return new Date(NaN);
  return toNY(`${ymd}T12:00:00Z`);
}

function offsetMinutes(ymd: CanonicalYmd, minutes: number): Date {
  const base = isoDateFromYmd(ymd);
  if (Number.isNaN(base.getTime())) return base;
  const d = new Date(base.getTime());
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes, 0, 0);
  return d;
}

export type MarketBoundaries = {
  ymd: CanonicalYmd;
  open: Date;
  close: Date;
};

function normalizeYmd(input: string): string | null {
  const match = YMD_RE.exec(input);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * 统一入口（后续所有模块将逐步切换到此）：
 * - 若 opts.freeze 存在，统一规范化为 YYYY-MM-DD；若非交易日则回退上一交易日；
 * - 否则转发到现有 getLatestTradingDayStr（含盘前/周末等口径）。
 */
function normalizeFreezeInput(freeze: string): string | null {
  const trimmed = freeze.trim();
  if (!trimmed) return null;
  const normalized = normalizeYmd(trimmed);
  if (normalized) return normalized;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return ymdInNY(parsed);
}

function normalizeArbitraryYmd(input: string): string | null {
  const normalized = normalizeFreezeInput(input);
  if (!normalized) return null;
  return normalized;
}

export function resolveTradingDayStr(now: number | Date = Date.now(), opts: ResolveOpts = {}): string {
  const freezeInput = typeof opts.freeze === 'string' ? normalizeFreezeInput(opts.freeze) : null;
  if (freezeInput) {
    if (isTradingDay(freezeInput)) {
      return freezeInput;
    }
    const fallback = previousTradingDay(freezeInput);
    if (fallback) {
      return fallback;
    }
    return freezeInput;
  }
  const latest = _latestTradingDayStr(now instanceof Date ? now : new Date(now));
  if (!isTradingDay(latest)) {
    const fallback = previousTradingDay(latest);
    return fallback || latest;
  }
  return latest;
}

/** 纽约本地日字符串（YYYY-MM-DD），用于展示/键名统一 */
export function ymdInNY(now: number | Date = Date.now()): string {
  return _ymdInNY(now);
}

/** 对比/兼容：现有“日历日口径”的交易日推导（后续统一收敛） */
export function calendarTradingDayStr(now: number | Date = Date.now()): string {
  return _calendarTradingDayStr(now);
}

/** 是否交易日（节假日感知） */
export function isTradingDay(ymd: string): boolean {
  const normalized = normalizeArbitraryYmd(ymd);
  if (!normalized) return false;
  if (ADHOC_CLOSED_DATES.has(normalized)) return false;
  if (isWeekend(normalized)) return false;
  if (isNyseHoliday(normalized)) return false;
  return true;
}

/** 上一交易日（节假日感知） */
export function previousTradingDay(ymd: string): string {
  const normalized = normalizeArbitraryYmd(ymd) ?? _ymdInNY(ymd);
  if (!normalized) return '';
  let probe = isoDateFromYmd(normalized);
  if (Number.isNaN(probe.getTime())) return '';
  let guard = 0;
  while (guard < 32) {
    probe.setDate(probe.getDate() - 1);
    const candidate = _ymdInNY(probe);
    if (candidate && isTradingDay(candidate)) {
      return candidate;
    }
    guard += 1;
  }
  return '';
}

/** 下一交易日（节假日感知） */
export function nextTradingDay(ymd: string): string {
  const normalized = normalizeArbitraryYmd(ymd) ?? _ymdInNY(ymd);
  if (!normalized) return '';
  let probe = isoDateFromYmd(normalized);
  if (Number.isNaN(probe.getTime())) return '';
  let guard = 0;
  while (guard < 32) {
    probe.setDate(probe.getDate() + 1);
    const candidate = _ymdInNY(probe);
    if (candidate && isTradingDay(candidate)) {
      return candidate;
    }
    guard += 1;
  }
  return '';
}

/** 生成指定区间内（含端点）的纽约交易日序列 */
export function* makeTradingDayRange(
  from: string,
  to: string,
): IterableIterator<string> {
  const start = normalizeArbitraryYmd(from) ?? _ymdInNY(from);
  const end = normalizeArbitraryYmd(to) ?? _ymdInNY(to);
  if (!start || !end) {
    return;
  }
  const [lower, upper] = start <= end ? [start, end] : [end, start];
  let cursor = isoDateFromYmd(lower);
  const limit = isoDateFromYmd(upper);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(limit.getTime())) {
    return;
  }
  let guard = 0;
  while (cursor.getTime() <= limit.getTime() && guard < 512) {
    const candidate = _ymdInNY(cursor);
    if (candidate && isTradingDay(candidate)) {
      yield candidate;
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
}

/** 当日市场开/收盘边界（节假日感知） */
export function marketBoundaries(ymd: string): MarketBoundaries {
  const normalized = normalizeArbitraryYmd(ymd) ?? _ymdInNY(ymd);
  const safe = normalized ?? '';
  const open = offsetMinutes(safe, MARKET_OPEN_MINUTES);
  const close = offsetMinutes(safe, MARKET_CLOSE_MINUTES);
  return { ymd: safe, open, close };
}

export { MARKET_OPEN_MINUTES, MARKET_CLOSE_MINUTES };

// 约定：从本文件导出的函数与常量，视为“纽约交易日”的唯一对外接口（Authority）。
// 后续新增代码应仅依赖本模块，不再直接引用 timezone/tradingDay/marketHours 的内部细节。
