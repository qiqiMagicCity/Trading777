import type { EnrichedTrade } from "@/lib/fifo";
import { MoneyDecimal as M, round2 } from "@/lib/money";
import type { Position } from "@/lib/services/dataService";
import sortTrades from "@/lib/sortTrades";
import { nowNY, toNY, ymdInNY } from "@/lib/timezone";
import type { DailyResult } from "@/lib/types";

const EPSILON = 1e-6;

export type ClosePriceMap = Record<string, Record<string, number>>;

export type MissingCloseFallback =
  | "MARK_PRICE"
  | "PREVIOUS_CLOSE"
  | "AVERAGE_COST";

export interface MissingCloseEntry {
  symbol: string;
  date: string;
  fallback: MissingCloseFallback;
}

export interface DailyResultsDiagnostics {
  missingCloses: MissingCloseEntry[];
}

function normalizeSymbol(symbol: string | undefined): string {
  return (symbol ?? "").trim().toUpperCase();
}

function isValidDateStr(date: string | undefined): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function toDateStr(value: string | Date | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const date = toNY(value);
  if (isNaN(date.getTime())) return null;
  return ymdInNY(date);
}

export function normalizeClosePriceMap(input: ClosePriceMap | Record<string, any> | undefined): ClosePriceMap {
  const result: ClosePriceMap = {};
  if (!input) return result;
  for (const [rawSymbol, rawByDate] of Object.entries(input)) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) continue;
    const target = result[symbol] ?? (result[symbol] = {});
    if (!rawByDate || typeof rawByDate !== "object") continue;
    for (const [rawDate, rawPrice] of Object.entries(rawByDate as Record<string, any>)) {
      if (!isValidDateStr(rawDate)) continue;
      const price = Number(rawPrice);
      if (!Number.isFinite(price)) continue;
      target[rawDate] = price;
    }
  }
  return result;
}

export interface ClosePriceRow {
  symbol: string;
  date: string;
  close: number;
  source?: string;
}

export interface ClosePriceRowOptions {
  includeSources?: string[];
  excludeSources?: string[];
}

export function closePricesFromRows(
  rows: ClosePriceRow[],
  options: ClosePriceRowOptions = {},
): ClosePriceMap {
  const { includeSources, excludeSources } = options;
  const includeSet = includeSources ? new Set(includeSources) : null;
  const excludeSet = excludeSources ? new Set(excludeSources) : null;
  const map: ClosePriceMap = {};
  for (const row of rows) {
    const source = row.source;
    if (includeSet && (!source || !includeSet.has(source))) {
      continue;
    }
    if (excludeSet && source && excludeSet.has(source)) {
      continue;
    }
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol || !isValidDateStr(row.date)) continue;
    const price = Number(row.close);
    if (!Number.isFinite(price)) continue;
    (map[symbol] ??= {})[row.date] = price;
  }
  return map;
}

export function mergeClosePriceMaps(...maps: ClosePriceMap[]): ClosePriceMap {
  const result: ClosePriceMap = {};
  for (const map of maps) {
    for (const [symbol, byDate] of Object.entries(map)) {
      const target = result[symbol] ?? (result[symbol] = {});
      for (const [date, price] of Object.entries(byDate)) {
        target[date] = price;
      }
    }
  }
  return result;
}

interface PositionState {
  qty: number;
  avgPrice: number;
}

export interface DailyResultsOptions {
  trades: EnrichedTrade[];
  positions?: Position[];
  closePrices?: ClosePriceMap | Record<string, any>;
  evalDate: string;
}

export function generateDailyResults({
  trades,
  positions = [],
  closePrices,
  evalDate,
}: DailyResultsOptions, diagnostics?: DailyResultsDiagnostics): DailyResult[] {
  const evalDateStr = (evalDate || "").slice(0, 10);
  if (!isValidDateStr(evalDateStr)) {
    throw new Error(`Invalid evalDate provided: ${evalDate}`);
  }

  const freezeDate =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_FREEZE_DATE?.trim()) ||
    (() => {
      const freeze = (globalThis as Record<string, unknown>).NEXT_PUBLIC_FREEZE_DATE;
      return typeof freeze === "string" ? freeze.trim() : "";
    })();
  const treatRealtimeAsClose = (() => {
    if (freezeDate) return false;
    const now = nowNY();
    const nowDateStr = ymdInNY(now);
    if (nowDateStr !== evalDateStr) return false;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  })();

  const normalizedClose = normalizeClosePriceMap(closePrices as any);
  const finalPriceMap = new Map<string, number>();
  for (const pos of positions) {
    const symbol = normalizeSymbol(pos.symbol);
    if (!symbol) continue;
    if (Number.isFinite(pos.last)) {
      finalPriceMap.set(symbol, Number(pos.last));
    }
  }

  const sortedTrades = sortTrades(trades);
  const tradesByDate = new Map<string, EnrichedTrade[]>();
  const dateSet = new Set<string>();
  const symbolSet = new Set<string>();

  for (const trade of sortedTrades) {
    const symbol = normalizeSymbol(trade.symbol);
    if (!symbol) continue;
    symbolSet.add(symbol);
    const day = toDateStr(trade.date);
    if (!day) continue;
    if (day > evalDateStr) continue;
    if (!tradesByDate.has(day)) {
      tradesByDate.set(day, []);
    }
    tradesByDate.get(day)!.push(trade);
    dateSet.add(day);
  }

  for (const pos of positions) {
    const symbol = normalizeSymbol(pos.symbol);
    if (!symbol) continue;
    symbolSet.add(symbol);
  }

  for (const symbol of symbolSet) {
    const byDate = normalizedClose[symbol];
    if (!byDate) continue;
    for (const date of Object.keys(byDate)) {
      if (date <= evalDateStr) {
        dateSet.add(date);
      }
    }
  }

  dateSet.add(evalDateStr);

  const dates = Array.from(dateSet)
    .filter(isValidDateStr)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const state = new Map<string, PositionState>();
  const lastKnownPrice = new Map<string, number>();
  const results: DailyResult[] = [];
  let prevUnrealizedDec = new M(0);

  const diagTracker = diagnostics
    ? (() => {
        const map = new Map<string, Set<MissingCloseFallback>>();
        for (const entry of diagnostics.missingCloses) {
          const key = `${entry.date}__${entry.symbol}`;
          const current = map.get(key) ?? new Set<MissingCloseFallback>();
          current.add(entry.fallback);
          map.set(key, current);
        }
        return map;
      })()
    : null;
  const reportMissing = (
    symbol: string,
    date: string,
    fallback: MissingCloseFallback,
  ) => {
    if (!diagnostics || !diagTracker) return;
    const key = `${date}__${symbol}`;
    const set = diagTracker.get(key) ?? new Set<MissingCloseFallback>();
    if (set.has(fallback)) return;
    set.add(fallback);
    diagTracker.set(key, set);
    diagnostics.missingCloses.push({ symbol, date, fallback });
  };

  for (const date of dates) {
    const tradesToday = tradesByDate.get(date) ?? [];
    const realizedDec = tradesToday.reduce((sum, trade) => sum.plus(trade.realizedPnl ?? 0), new M(0));

    for (const trade of tradesToday) {
      const symbol = normalizeSymbol(trade.symbol);
      if (!symbol) continue;
      const qtyAfter =
        typeof trade.quantityAfter === "number" && Number.isFinite(trade.quantityAfter)
          ? trade.quantityAfter
          : state.get(symbol)?.qty ?? 0;
      const avgCost =
        typeof trade.averageCost === "number" && Number.isFinite(trade.averageCost)
          ? trade.averageCost
          : state.get(symbol)?.avgPrice ?? 0;
      if (Math.abs(qtyAfter) <= EPSILON) {
        state.delete(symbol);
      } else {
        state.set(symbol, { qty: qtyAfter, avgPrice: avgCost });
      }
    }

    const unrealizedDec = Array.from(state.entries()).reduce((sum, [symbol, posState]) => {
      const qty = posState.qty;
      const absQty = Math.abs(qty);
      if (absQty <= EPSILON) return sum;
      let price: number | undefined;
      const byDate = normalizedClose[symbol];
      if (byDate && Number.isFinite(byDate[date])) {
        price = Number(byDate[date]);
      }
      if (price === undefined && date === evalDateStr) {
        const final = finalPriceMap.get(symbol);
        if (final !== undefined && Number.isFinite(final)) {
          price = final;
          if (!treatRealtimeAsClose) {
            reportMissing(symbol, date, "MARK_PRICE");
          }
        }
      }
      if (price === undefined) {
        const prev = lastKnownPrice.get(symbol);
        if (prev !== undefined && Number.isFinite(prev)) {
          price = prev;
          reportMissing(symbol, date, "PREVIOUS_CLOSE");
        }
      }
      if (price === undefined && Number.isFinite(posState.avgPrice)) {
        price = posState.avgPrice;
        reportMissing(symbol, date, "AVERAGE_COST");
      }
      if (price === undefined) return sum;
      lastKnownPrice.set(symbol, price);
      const diff = qty >= 0 ? price - posState.avgPrice : posState.avgPrice - price;
      return sum.plus(new M(diff).mul(absQty));
    }, new M(0));

    const hasTrades = tradesToday.length > 0;
    const hasPositions = state.size > 0;
    if (!hasTrades && !hasPositions && date !== evalDateStr) {
      continue;
    }

    const realized = round2(realizedDec);
    const unrealized = round2(unrealizedDec);
    const delta = round2(unrealizedDec.minus(prevUnrealizedDec));
    prevUnrealizedDec = unrealizedDec;

    results.push({
      date,
      realized,
      unrealized,
      unrealizedDelta: delta,
    });
  }

  return results.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
