import type { Daily } from './metrics-periods';
import { normalizeToNyDay, startOfDayNY } from './time';

function normalizeToNYMidday(ymd: string): string {
  return `${ymd}T12:00:00`;
}

function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 仅保留参与求和的核心字段，做稳定 stringify，再哈希 */
function stableKeyForDaily(daily: Daily[]): string {
  const norm = (daily || []).map(d => [
    d.date,
    +(d.realized || 0),
    +(d.unrealized || 0),
    d.unrealizedDelta === undefined ? null : +(d.unrealizedDelta || 0),
  ]);
  const json = JSON.stringify(norm);
  // 简单 djb2 哈希，足够做 cache key
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return (h >>> 0).toString(36) + `~${norm.length}`;
}

type Inner = {
  sums: Map<string, number>; // key: "start|end" -> sum
  dates: number[];
  prefix: number[];
};

const CACHE = new Map<string, Inner>(); // key: datasetKey

/** 清理过大的缓存，避免内存无限增长（极简 LRU：超 32 个数据集时清空最早的 8 个） */
function gc() {
  if (CACHE.size <= 32) return;
  const toDelete = Array.from(CACHE.keys()).slice(0, 8);
  toDelete.forEach(k => CACHE.delete(k));
}

function buildInner(daily: Daily[]): Inner {
  const sorted = (daily || [])
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const dates: number[] = [];
  const prefix: number[] = [];
  let prevUnrealized = 0;
  let acc = 0;

  for (const d of sorted) {
    if (!d?.date) continue;
    const normalizedDate =
      typeof d.date === 'string' ? normalizeToNyDay(d.date) : d.date;
    const dt = new Date(normalizedDate);
    if (!Number.isFinite(dt.valueOf())) continue;
    const dayTS = startOfDayNY(normalizedDate).getTime();
    if (!Number.isFinite(dayTS)) continue;

    const unrealized = d?.unrealized ?? 0;
    const delta =
      typeof d?.unrealizedDelta === 'number'
        ? d.unrealizedDelta
        : unrealized - prevUnrealized;

    acc += (d?.realized ?? 0) + delta;
    dates.push(dayTS);
    prefix.push(acc);
    prevUnrealized = unrealized;
  }

  return { sums: new Map(), dates, prefix };
}

function lowerBound(arr: number[], target: number) {
  let l = 0,
    r = arr.length;
  while (l < r) {
    const m = (l + r) >> 1;
    const mid = arr[m]!;
    if (mid < target) l = m + 1;
    else r = m;
  }
  return l;
}

/** 带缓存的周期求和（包含 realized + unrealized 变化量） */
export function sumPeriodCached(daily: Daily[], startISO: string, endISO: string): number {
  const dsKey = stableKeyForDaily(daily);
  let inner = CACHE.get(dsKey);
  if (!inner) {
    inner = buildInner(daily);
    CACHE.set(dsKey, inner);
    gc();
  }

  const startDate = startOfDayNY(normalizeToNYMidday(startISO));
  const endExclusiveDate = startOfDayNY(normalizeToNYMidday(addDaysYmd(endISO, 1)));
  const key = `${startDate.toISOString()}|${endExclusiveDate.toISOString()}`;
  if (inner.sums.has(key)) return inner.sums.get(key)!;

  const start = startDate.getTime();
  const endExclusive = endExclusiveDate.getTime();
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(endExclusive) ||
    start >= endExclusive
  ) {
    inner.sums.set(key, 0);
    return 0;
  }

  const startIdx = lowerBound(inner.dates, start);
  const endIdx = lowerBound(inner.dates, endExclusive);

  let total = 0;
  if (startIdx < inner.prefix.length) {
    const lastIdx = endIdx - 1;
    if (lastIdx >= startIdx && lastIdx < inner.prefix.length) {
      const prev = startIdx === 0 ? 0 : inner.prefix[startIdx - 1]!;
      total = inner.prefix[lastIdx]! - prev;
    }
  }

  inner.sums.set(key, total);
  return total;
}
