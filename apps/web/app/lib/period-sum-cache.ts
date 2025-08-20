import type { Daily } from './metrics-periods';

/** 仅保留参与求和的核心字段，做稳定 stringify，再哈希 */
function stableKeyForDaily(daily: Daily[]): string {
  const norm = (daily || []).map(d => [d.date, +(d.realized||0), +(d.unrealized||0)]);
  const json = JSON.stringify(norm);
  // 简单 djb2 哈希，足够做 cache key
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h) ^ json.charCodeAt(i);
  return (h >>> 0).toString(36) + `~${norm.length}`;
}

type Inner = Map<string, number>; // key: "start|end" -> sum
const CACHE = new Map<string, Inner>(); // key: datasetKey

/** 清理过大的缓存，避免内存无限增长（极简 LRU：超 32 个数据集时清空最早的 8 个） */
function gc() {
  if (CACHE.size <= 32) return;
  const toDelete = Array.from(CACHE.keys()).slice(0, 8);
  toDelete.forEach(k => CACHE.delete(k));
}

/** 带缓存的周期求和（包含 realized+unrealized） */
export function sumPeriodCached(daily: Daily[], startISO: string, endISO: string): number {
  const dsKey = stableKeyForDaily(daily);
  let inner = CACHE.get(dsKey);
  if (!inner) { inner = new Map(); CACHE.set(dsKey, inner); gc(); }

  const key = `${startISO}|${endISO}`;
  if (inner.has(key)) return inner.get(key)!;

  const start = new Date(startISO);
  const end   = new Date(endISO);
  let s = 0;
  for (const d of daily || []) {
    const dt = new Date(d.date);
    if (dt >= start && dt <= end) {
      s += (d?.realized ?? 0) + (d?.unrealized ?? 0);
    }
  }
  inner.set(key, s);
  return s;
}
