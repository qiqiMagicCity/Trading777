/**
 * timezone.ts – Helpers to ensure the site consistently uses New York (America/New_York) time,
 * regardless of server or browser locale.
 *
 * 统一处理纽约时区（America/New_York）工具函数：
 *  - toNY(...)   同 Date 构造函数，用法完全一致，但返回值保证在纽约时区。
 *  - nowNY()     返回当前纽约时间 Date 对象。
 *  - formatNY()  安全格式化为字符串，默认 "YYYY-MM-DD HH:mm"。
 *
 * 使用示例：
 *   const date = toNY();                 // 现在
 *   const date2 = toNY('2025-07-23');    // 任意 Date/字符串/时间戳
 *   const date3 = toNY(2025, 0, 1);      // 年月日，用法与 new Date(2025,0,1)
 */

// Ensure server timezone defaults to New York
if (typeof process !== "undefined") {
  process.env.TZ = process.env.TZ || "America/New_York";
}
export function toNY(): Date;
export function toNY(value: string | number | Date): Date;
export function toNY(
  year: number,
  month: number,
  date?: number,
  hours?: number,
  minutes?: number,
  seconds?: number,
  ms?: number,
): Date;

/** 实现 – 同 Date 构造函数，但最终始终转换为纽约时间 */
export function toNY(...args: any[]): Date {
  let date: Date;

  if (args.length === 0) {
    date = new Date();
  } else if (args.length === 1) {
    const v = args[0];
    date = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  } else {
    // 与 new Date(year, month, ...) 行为保持一致
    // (服务器已通过 TZ=America/New_York 保证本地时区为纽约，否则仍再转一次)
    // eslint-disable-next-line prefer-spread
    date = new (Date as any)(...args);
  }

  // 若环境时区已经是纽约，则无需转换
  const localeString = date.toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  return new Date(localeString);
}

/** 当前纽约时间对象 */
export const nowNY = (): Date => toNY();

/** 字符串格式化 */
export const formatNY = (
  dateInput: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
): string =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    ...options,
  }).format(
    typeof dateInput === "object" ? (dateInput as Date) : toNY(dateInput),
  );

/**
 * 获取最新交易日（纽约时区）的日期字符串。
 * 如果当前时间早于 09:30，则回退一天；
 * 若结果落在周末，则继续回退直到周五。
 * 返回格式为 YYYY-MM-DD。
 */
export const getLatestTradingDayStr = (base: Date = nowNY()): string => {
  const freeze =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FREEZE_DATE) ||
    // @ts-ignore
    (typeof window !== 'undefined' && (window as any).NEXT_PUBLIC_FREEZE_DATE);
  if (freeze) return freeze as string;

  const d = toNY(base);
  if (d.getHours() < 9 || (d.getHours() === 9 && d.getMinutes() < 30)) {
    d.setDate(d.getDate() - 1);
  }
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().slice(0, 10);
};

/** 获取指定纽约日期的当日结束时间 */
export const endOfDayNY = (date: Date): Date => {
  const d = toNY(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** 获取所在周的周一日期（纽约时区），返回 YYYY-MM-DD */
export const weekStartNY = (dateInput: string | Date): string => {
  const d = toNY(dateInput);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
};

/** 获取所在月的月初日期（纽约时区），返回 YYYY-MM-DD */
export const monthStartNY = (dateInput: string | Date): string => {
  const d = toNY(dateInput);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};

/** 获取所在年的年初日期（纽约时区），返回 YYYY-MM-DD */
export const yearStartNY = (dateInput: string | Date): string => {
  const d = toNY(dateInput);
  d.setMonth(0, 1);
  return d.toISOString().slice(0, 10);
};

/** 获取纽约时区当周周一零点的 Date 对象 */
export const startOfWeekNY = (dateInput: string | Date): Date => {
  const d = toNY(dateInput);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 获取纽约时区当月月初零点的 Date 对象 */
export const startOfMonthNY = (dateInput: string | Date): Date => {
  const d = toNY(dateInput);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 获取纽约时区当年年初零点的 Date 对象 */
export const startOfYearNY = (dateInput: string | Date): Date => {
  const d = toNY(dateInput);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Attach helper to global for quick usage in dev tools
// @ts-ignore
(globalThis as any).toNY = toNY;
(globalThis as any).nowNY = nowNY;
(globalThis as any).formatNY = formatNY;
(globalThis as any).getLatestTradingDayStr = getLatestTradingDayStr;
(globalThis as any).endOfDayNY = endOfDayNY;
