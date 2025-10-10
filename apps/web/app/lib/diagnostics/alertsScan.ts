import { normalizeCloseMap } from "@/app/lib/prices/normalizeCloseMap";
import { filterMissingOfficialCloses } from "@/app/lib/prices/filterMissingOfficialCloses";
import { requireOfficialClose } from "@/app/lib/prices/officialCloseFacade";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

export type ScanUniverse = { dates: string[]; symbols: string[] };

export async function scanUnified(universe: ScanUniverse) {
  const entries = await filterMissingOfficialCloses({ requireOfficialClose });
  const filtered = filterByUniverse(entries, universe);
  const missing = filtered.map((entry) => ({
    date: entry.date,
    symbol: entry.symbol?.toUpperCase() ?? entry.symbol,
  }));
  return { missing };
}

export async function scanPackagedOnly(universe: ScanUniverse) {
  const fetchFn = typeof fetch === 'function' ? fetch : typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
  if (!fetchFn) {
    return {
      error: 'fetch unavailable',
      missing: [] as Array<{ date: string; symbol: string }>,
    };
  }
  const response = await fetchFn(`/close_prices.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    return { error: `packaged fetch ${response.status}`, missing: [] as Array<{ date: string; symbol: string }> };
  }
  const raw = await response.json();
  const byDate = normalizeCloseMap(raw);
  const missing: Array<{ date: string; symbol: string }> = [];
  for (const date of universe.dates) {
    const map = byDate[date] || {};
    for (const symbol of universe.symbols) {
      const value = map[symbol];
      if (value == null) {
        missing.push({ date, symbol });
      }
    }
  }
  return { missing };
}

function filterByUniverse(entries: MissingOfficialCloseEntry[], universe: ScanUniverse) {
  if (!universe.symbols.length && !universe.dates.length) {
    return entries.slice();
  }
  const symbolSet = new Set(universe.symbols.map((symbol) => symbol.toUpperCase()));
  const dateSet = new Set(universe.dates);
  return entries.filter((entry) => {
    const entrySymbol = entry.symbol?.toUpperCase();
    const entryDate = entry.date;
    const matchSymbol = !symbolSet.size || symbolSet.has(entrySymbol);
    const matchDate = !dateSet.size || dateSet.has(entryDate);
    return matchSymbol && matchDate;
  });
}
