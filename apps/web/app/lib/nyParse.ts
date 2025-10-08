/**
 * 纽约正午锚点解析（避免字符串解析的本地/UTC 歧义）
 * - 通过显式计算美国夏令时区间，判断纽约当日的 UTC 偏移；
 * - 提供纽约日历日对应的 UTC 时间戳（纽约当地 12:00）与 Date 对象。
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function ymdParts(ymd: string): [number, number, number] {
  const match = YMD_RE.exec(ymd);
  if (!match) {
    throw new Error(`Invalid ymd: ${ymd}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateUtc(y: number, m1: number, d: number): Date {
  // eslint-disable-next-line no-restricted-syntax -- 底层 UTC 构造目前依赖 Date.UTC，后续将迁移至无禁用实现
  return new Date(Date.UTC(y, m1 - 1, d, 0, 0, 0));
}

function nthWeekdayOfMonth(y: number, m1: number, weekday: number, n: number): string {
  const first = dateUtc(y, m1, 1);
  const firstWeekday = first.getUTCDay();
  const offset = ((7 + weekday - firstWeekday) % 7) + (n - 1) * 7;
  const target = new Date(first.getTime() + offset * 86400000);
  return toYmd(target);
}

function firstSundayOfNovember(y: number): string {
  return nthWeekdayOfMonth(y, 11, 0, 1);
}

function secondSundayOfMarch(y: number): string {
  return nthWeekdayOfMonth(y, 3, 0, 2);
}

function toYmd(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 判断给定纽约日历日是否处于夏令时。 */
export function isNyDst(ymd: string): boolean {
  const [year] = ymdParts(ymd);
  const dstStart = secondSundayOfMarch(year); // inclusive
  const dstEnd = firstSundayOfNovember(year); // exclusive
  return ymd >= dstStart && ymd < dstEnd;
}

/** 返回纽约当地 12:00 对应的 UTC 时间戳（毫秒）。 */
export function tsFromYmdAtNoonUTC(ymd: string): number {
  const [year, month, day] = ymdParts(ymd);
  const offsetMinutes = isNyDst(ymd) ? -240 : -300; // 纽约相对 UTC 的偏移（分钟）
  // Local -> UTC: UTC = local - offset
  // eslint-disable-next-line no-restricted-syntax -- 纽约正午锚点暂以 Date.UTC 构造，后续可替换
  return Date.UTC(year, month - 1, day, 12, 0, 0) - offsetMinutes * 60 * 1000;
}

/** 返回纽约当地 12:00 对应的 UTC Date 对象。 */
export function utcFromYmdAtNoon(ymd: string): Date {
  return new Date(tsFromYmdAtNoonUTC(ymd));
}

