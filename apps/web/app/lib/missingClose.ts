import type {
  DailyResultsDiagnostics,
  MissingCloseEntry,
  MissingCloseFallback,
} from "@/app/lib/dailyResults";
import type { MissingCloseSummary } from "@/app/lib/types/health";

function sortFallbacks(fallbacks: MissingCloseFallback[]): MissingCloseFallback[] {
  const order: Record<MissingCloseFallback, number> = {
    MARK_PRICE: 0,
    PREVIOUS_CLOSE: 1,
    AVERAGE_COST: 2,
    OFFICIAL_CLOSE: 3,
  };
  return [...fallbacks].sort((a, b) => order[a] - order[b]);
}

export function summarizeMissingCloses(
  entries: MissingCloseEntry[],
): MissingCloseSummary[] {
  if (!entries.length) return [];
  const map = new Map<
    string,
    Map<string, Set<MissingCloseFallback>>
  >();
  for (const entry of entries) {
    const bySymbol = map.get(entry.ymd) ?? new Map<string, Set<MissingCloseFallback>>();
    const set = bySymbol.get(entry.symbol) ?? new Set<MissingCloseFallback>();
    set.add(entry.fallback);
    bySymbol.set(entry.symbol, set);
    map.set(entry.ymd, bySymbol);
  }
  const result: MissingCloseSummary[] = [];
  for (const [date, bySymbol] of map.entries()) {
    const symbols = Array.from(bySymbol.entries()).map(([symbol, fallbacks]) => ({
      symbol,
      fallbacks: sortFallbacks(Array.from(fallbacks)),
    }));
    symbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
    result.push({
      ymd: date,
      symbols,
    });
  }
  result.sort((a, b) => a.ymd.localeCompare(b.ymd));
  return result;
}

export function formatMissingCloseLineTickersOnly(
  dateStr: string,
  tickers: string[],
): string {
  return `${dateStr}：${tickers.join('、')}`;
}

export function diagnosticsHasMissing(
  diagnostics: DailyResultsDiagnostics | undefined,
): boolean {
  return Boolean(diagnostics && diagnostics.missingCloses.length > 0);
}
