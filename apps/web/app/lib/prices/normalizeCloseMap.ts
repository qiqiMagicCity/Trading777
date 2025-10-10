// 统一输出：Record<date, Record<symbol, number>>  —— 内部一律按“日期→股票”用
export type CloseMapByDate = Record<string, Record<string, number>>;
type AnyMap = Record<string, any>;

const isISODate = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
// 允许大写字母/数字/点/破折号（如 BRK.B、BABA-SW）
const isTicker = (k: string) => /^[A-Z0-9.-]{1,12}$/.test(k);

const toNum = (v: any) => {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const hasIsoDateKey = (map: AnyMap | null | undefined) => {
  if (!map || typeof map !== 'object') return false;
  return Object.keys(map).some((k) => isISODate(String(k)));
};

const hasTickerKey = (map: AnyMap | null | undefined) => {
  if (!map || typeof map !== 'object') return false;
  return Object.keys(map).some((k) => isTicker(String(k).toUpperCase()));
};

const shouldTreatAsDateFirst = (raw: AnyMap) => {
  let isoTop = 0;
  let tickerTop = 0;
  let isoWithTickerChildren = 0;
  let tickerWithIsoChildren = 0;

  for (const [key, value] of Object.entries<any>(raw)) {
    const keyStr = String(key);
    const valueObj = value && typeof value === 'object' ? value : undefined;

    if (isISODate(keyStr)) {
      isoTop += 1;
      if (hasTickerKey(valueObj)) isoWithTickerChildren += 1;
    }

    if (isTicker(keyStr.toUpperCase())) {
      tickerTop += 1;
      if (hasIsoDateKey(valueObj)) tickerWithIsoChildren += 1;
    }
  }

  if (isoWithTickerChildren || tickerWithIsoChildren) {
    // 优先依赖强信号：ISO 顶层且子级包含股票代码 / 反之亦然
    if (isoWithTickerChildren > tickerWithIsoChildren) return true;
    if (tickerWithIsoChildren > isoWithTickerChildren) return false;
  }

  return isoTop >= tickerTop;
};

/**
 * 兼容两种形态：
 * 1) by-date: { "2025-10-03": { AMZN: 219.51, ... }, ... }
 * 2) by-symbol: { AMZN: { "2025-10-03": 219.51, ... }, ... }
 * 输出一律为 by-date。
 */
export function normalizeCloseMap(raw: AnyMap | null | undefined): CloseMapByDate {
  const out: CloseMapByDate = {};
  if (!raw || typeof raw !== 'object') return out;

  const treatAsDateFirst = shouldTreatAsDateFirst(raw);

  // 情况A：已是 by-date —— 清洗后直接返回
  if (treatAsDateFirst) {
    for (const [date, symMap] of Object.entries<any>(raw)) {
      if (!isISODate(String(date)) || typeof symMap !== 'object') continue;
      for (const [sym0, val] of Object.entries<any>(symMap)) {
        const sym = String(sym0).toUpperCase();
        if (!isTicker(sym)) continue;
        const n = toNum(val);
        if (n == null) continue;
        (out[String(date)] ||= {})[sym] = n;
      }
    }
    return out;
  }

  // 情况B：by-symbol —— 转置为 by-date
  for (const [sym0, dateMap] of Object.entries<any>(raw)) {
    const sym = String(sym0).toUpperCase();
    if (!isTicker(sym) || typeof dateMap !== 'object') continue;
    for (const [date, val] of Object.entries<any>(dateMap)) {
      if (!isISODate(String(date))) continue;
      const n = toNum(val);
      if (n == null) continue;
      (out[String(date)] ||= {})[sym] = n;
    }
  }
  return out;
}
