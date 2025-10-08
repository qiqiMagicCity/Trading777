/* eslint-disable no-restricted-syntax -- 浏览器侧底层实现需要使用 Date.UTC 计算 UTC 锚点 */
/* Lightweight NY-safe helpers for legacy public scripts (browser-only) */

// 1) 纽约口径 YYYY-MM-DD（依赖 Intl.DateTimeFormat）
export function ymdInNY(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(date); // en-CA -> YYYY-MM-DD
}

// 2) 星期（纯算法，与时区无关）—— Sakamoto 算法，Sunday=0
export function nyDow(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error('invalid ymd: ' + ymd);
  let y = +m[1];
  const month = +m[2];
  const d = +m[3];
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + d) % 7;
}

// 3) 某纽约日历日的 UTC 时间范围（秒）
//    实现：以纽约“正午锚点”推回当天 00:00:00 与推进至 23:59:59。
//    DST 切换发生在周日，对交易日无影响；此法对交易日窗口严格安全。
function isNyDstByRule(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const y = +m[1];
  const nthSun = (mo, n) => {
    const d0 = new Date(Date.UTC(y, mo - 1, 1));
    const w0 = d0.getUTCDay();
    const off = ((7 - w0) % 7) + (n - 1) * 7;
    return new Date(Date.UTC(y, mo - 1, 1 + off));
  };
  const secondSunMar = nthSun(3, 2);
  const firstSunNov = nthSun(11, 1);
  const cur = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
  return cur.getTime() >= secondSunMar.getTime() && cur.getTime() < firstSunNov.getTime();
}

export function nyNoonTsUTC(ymd) {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!mm) throw new Error('invalid ymd');
  const y = +mm[1];
  const mo = +mm[2];
  const d = +mm[3];
  const offsetMin = isNyDstByRule(ymd) ? -240 : -300; // NY 相对 UTC（UTC-4/UTC-5）
  // local->UTC: UTC = local - offset
  return Date.UTC(y, mo - 1, d, 12, 0, 0) - offsetMin * 60 * 1000;
}

export function nyEpochRangeForYmd(ymd) {
  const noon = nyNoonTsUTC(ymd);
  // 以正午为对称点：当天 00:00:00 与 23:59:59
  const from = Math.floor((noon - 12 * 3600 * 1000) / 1000);
  const to = Math.floor((noon + 11 * 3600 * 1000 + 59 * 1000 + 59) / 1000);
  return { from, to };
}

if (typeof window !== 'undefined') {
  window.NYSafe = Object.assign({}, window.NYSafe, {
    ymdInNY,
    nyDow,
    nyNoonTsUTC,
    nyEpochRangeForYmd,
  });
}
