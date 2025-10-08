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
import { previousTradingDay as _previousTradingDay, isTradingDay as _isTradingDay } from './marketHours';
import { isNyseHoliday, isWeekend } from './nyseHolidays';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeYmd(input: string): string | null {
  const match = YMD_RE.exec(input);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function stepBackOneDay(ymd: string): string {
  const parts = YMD_RE.exec(ymd);
  if (!parts) return ymd;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  // eslint-disable-next-line no-restricted-syntax -- 内部实现依赖 UTC 快速退一天，后续会替换为 nyParse 辅助
  const prev = new Date(Date.UTC(year, month - 1, day) - 86400000);
  const y = String(prev.getUTCFullYear()).padStart(4, '0');
  const m = String(prev.getUTCMonth() + 1).padStart(2, '0');
  const d = String(prev.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 统一入口（后续所有模块将逐步切换到此）：
 * - 若 opts.freeze 存在，直接返回该冻结日；
 * - 否则转发到现有 getLatestTradingDayStr（含盘前/周末等口径）。
 * 注：本步保持现有口径不变。
 */
export function resolveTradingDayStr(now: number | Date = Date.now(), opts: ResolveOpts = {}): string {
  if (opts.freeze) return opts.freeze;
  const latest = _latestTradingDayStr(now);
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
  const normalized = normalizeYmd(ymd);
  if (!normalized) return _isTradingDay(ymd);
  if (isWeekend(normalized)) return false;
  if (isNyseHoliday(normalized)) return false;
  return _isTradingDay(normalized);
}

/** 上一交易日（节假日感知） */
export function previousTradingDay(ymd: string): string {
  const normalized = normalizeYmd(ymd) ?? _ymdInNY(ymd);
  let candidate = _previousTradingDay(normalized);
  if (!candidate) return candidate;
  let guard = 0;
  while (candidate && !isTradingDay(candidate) && guard < 16) {
    const next = _previousTradingDay(candidate);
    if (!next || next === candidate) break;
    candidate = next;
    guard += 1;
  }
  if (candidate && !isTradingDay(candidate)) {
    let fallback = candidate;
    let attempts = 0;
    while (attempts < 16 && fallback && !isTradingDay(fallback)) {
      fallback = stepBackOneDay(fallback);
      attempts += 1;
    }
    return fallback;
  }
  return candidate;
}

// 约定：从本文件导出的函数与常量，视为“纽约交易日”的唯一对外接口（Authority）。
// 后续新增代码应仅依赖本模块，不再直接引用 timezone/tradingDay/marketHours 的内部细节。
