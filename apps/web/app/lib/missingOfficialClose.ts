import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

export interface MissingOfficialSymbolSummary {
  symbol: string;
  purposes: string[];
  impact: string[];
  hasFallback: boolean;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
}

export interface MissingOfficialDateSummary {
  date: string;
  symbols: MissingOfficialSymbolSummary[];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value && value.trim()))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function summarizeMissingOfficialCloses(
  entries: MissingOfficialCloseEntry[] = [],
): MissingOfficialDateSummary[] {
  if (!entries.length) return [];
  const dateMap = new Map<string, Map<string, MissingOfficialSymbolSummary>>();
  for (const entry of entries) {
    const dateKey = entry.date;
    const symbolKey = entry.symbol;
    if (!dateKey || !symbolKey) continue;
    const bySymbol = dateMap.get(dateKey) ?? new Map<string, MissingOfficialSymbolSummary>();
    const existing = bySymbol.get(symbolKey);
    const firstDetectedAt = entry.firstDetectedAt;
    const lastDetectedAt = entry.lastDetectedAt;

    if (existing) {
      existing.purposes = uniqueSorted([...existing.purposes, ...entry.purposes]);
      existing.impact = uniqueSorted([...existing.impact, ...entry.impact]);
      existing.hasFallback = existing.hasFallback || entry.hasFallback;
      if (
        firstDetectedAt &&
        (!existing.firstDetectedAt || firstDetectedAt < existing.firstDetectedAt)
      ) {
        existing.firstDetectedAt = firstDetectedAt;
      }
      if (
        lastDetectedAt &&
        (!existing.lastDetectedAt || lastDetectedAt > existing.lastDetectedAt)
      ) {
        existing.lastDetectedAt = lastDetectedAt;
      }
    } else {
      bySymbol.set(symbolKey, {
        symbol: symbolKey,
        purposes: uniqueSorted(entry.purposes),
        impact: uniqueSorted(entry.impact),
        hasFallback: entry.hasFallback,
        ...(firstDetectedAt ? { firstDetectedAt } : {}),
        ...(lastDetectedAt ? { lastDetectedAt } : {}),
      });
    }
    dateMap.set(dateKey, bySymbol);
  }

  return Array.from(dateMap.entries())
    .map(([date, symbolMap]) => ({
      date,
      symbols: Array.from(symbolMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
