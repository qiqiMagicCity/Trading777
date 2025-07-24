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
if (typeof process !== 'undefined') {
  process.env.TZ = process.env.TZ || 'America/New_York';
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
  const localeString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(localeString);
}

/** 当前纽约时间对象 */
export const nowNY = (): Date => toNY();

/** 字符串格式化 */
export const formatNY = (
  dateInput: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options }).format(
    typeof dateInput === 'object' ? (dateInput as Date) : toNY(dateInput),
  );

// Attach helper to global for quick usage in dev tools
// @ts-ignore
(globalThis as any).toNY = toNY;
(globalThis as any).nowNY = nowNY;
(globalThis as any).formatNY = formatNY;
