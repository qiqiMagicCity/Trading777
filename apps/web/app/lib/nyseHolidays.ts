/**
 * NYSE Holidays (rule-based + adhoc)
 * - 固定节日（含观察日 observed）：
 *   新年(1/1)、Juneteenth(6/19)、Independence Day(7/4)、圣诞(12/25)
 * - 规则节日：
 *   MLK(一月第三个周一)、Presidents(二月第三个周一)、Good Friday(复活节前周五)、
 *   Memorial Day(五月最后一个周一)、Labor Day(九月第一个周一)、
 *   Thanksgiving(十一月第四个周四)
 * - 兜底：ADHOC_CLOSED_DATES
 */

const ADHOC_CLOSED_DATES: string[] = [
  // 形如 'YYYY-MM-DD'，如遇特殊休市可在此追加
];

function ymdParts(ymd: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`Invalid ymd: ${ymd}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toYmdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 工具：UTC 视角构造与运算（避免本地时区干扰）
function dateUtc(y: number, m1: number, d: number): Date {
  // eslint-disable-next-line no-restricted-syntax -- 节假日规则暂使用 UTC 构造，后续治理时再替换
  return new Date(Date.UTC(y, m1 - 1, d));
}
function addDaysUtc(ymd: string, delta: number): string {
  const [y, m, d] = ymdParts(ymd);
  const t = dateUtc(y, m, d).getTime() + delta * 86400000;
  return toYmdUTC(new Date(t));
}
function weekdayUtc(ymd: string): number {
  const [y, m, d] = ymdParts(ymd);
  return dateUtc(y, m, d).getUTCDay(); // 0=Sun..6=Sat
}

// 规则节日计算
function nthWeekdayOfMonth(y: number, m1: number, weekday: number, n: number): string {
  // m1: 1..12
  const first = dateUtc(y, m1, 1);
  const firstW = first.getUTCDay();
  const offset = ((7 + weekday - firstW) % 7) + (n - 1) * 7;
  return toYmdUTC(new Date(first.getTime() + offset * 86400000));
}
function lastWeekdayOfMonth(y: number, m1: number, weekday: number): string {
  const firstNext = dateUtc(y, m1 + 1, 1);
  const last = new Date(firstNext.getTime() - 86400000);
  const w = last.getUTCDay();
  const offset = (7 + w - weekday) % 7;
  return toYmdUTC(new Date(last.getTime() - offset * 86400000));
}

// 复活节（Gregorian）- Meeus/Jones/Butcher 算法
function easterYmd(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar,4=Apr
  const day = 1 + ((h + l - 7 * m + 114) % 31);
  return toYmdUTC(dateUtc(y, month, day));
}
function goodFridayYmd(y: number): string {
  return addDaysUtc(easterYmd(y), -2);
}

// 固定节日的观察日
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function observedFixed(y: number, m1: number, d: number): string {
  const base = dateUtc(y, m1, d);
  const w = base.getUTCDay();
  if (w === 6) {
    // Saturday -> Friday
    return toYmdUTC(addDays(base, -1));
  }
  if (w === 0) {
    // Sunday -> Monday
    return toYmdUTC(addDays(base, 1));
  }
  return toYmdUTC(base);
}

// 返回某年 NYSE 假日集合
function holidaysOf(year: number): Set<string> {
  const s = new Set<string>();
  // 固定节日（含 observed）
  s.add(observedFixed(year, 1, 1)); // New Year's Day
  s.add(observedFixed(year, 6, 19)); // Juneteenth
  s.add(observedFixed(year, 7, 4)); // Independence Day
  s.add(observedFixed(year, 12, 25)); // Christmas

  // 规则节日
  s.add(nthWeekdayOfMonth(year, 1, 1, 3)); // MLK (Mon=1) 第三个周一
  s.add(nthWeekdayOfMonth(year, 2, 1, 3)); // Presidents Day 第三个周一
  s.add(goodFridayYmd(year)); // Good Friday
  s.add(lastWeekdayOfMonth(year, 5, 1)); // Memorial Day 最后一个周一
  s.add(nthWeekdayOfMonth(year, 9, 1, 1)); // Labor Day 第一个周一
  s.add(nthWeekdayOfMonth(year, 11, 4, 4)); // Thanksgiving 第四个周四

  // ADHOC
  ADHOC_CLOSED_DATES.forEach((d) => {
    const [y] = ymdParts(d);
    if (y === year) s.add(d);
  });
  return s;
}

export function isNyseHoliday(ymd: string): boolean {
  const [y] = ymdParts(ymd);
  const set = holidaysOf(y);
  // 如果观察日落在上一/下一年，也要覆盖
  const prev = holidaysOf(y - 1);
  const next = holidaysOf(y + 1);
  return set.has(ymd) || prev.has(ymd) || next.has(ymd);
}

export function isWeekend(ymd: string): boolean {
  const w = weekdayUtc(ymd);
  return w === 0 || w === 6;
}

