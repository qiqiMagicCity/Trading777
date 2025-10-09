import type { EnrichedTrade } from "@/lib/fifo";
import { MoneyDecimal as M, round2 } from "@/lib/money";
import type { Position } from "@/lib/services/dataService";
import sortTrades from "@/lib/sortTrades";
import { nowNY, toNY, ymdInNY } from "@/lib/timezone";
import { evaluateCloseRequirement } from "@/lib/marketHours";
import type { DailyResult } from "@/lib/types";
import {
  isTradingDay,
  previousTradingDay,
  resolveTradingDayStr,
  makeTradingDayRange,
} from "./nyDay";

const EPSILON = 1e-6;

export type Ymd = `${number}-${number}-${number}`;

export const isYmd = (k: string): k is Ymd => /^\d{4}-\d{2}-\d{2}$/.test(k);

/**
 * 只允许“YYYY-MM-DD”作为价格键；__sources 用于记录来源元信息。
 * 注意：使用 type 别名承载映射类型，避免 interface + 映射类型的语法错误。
 */
export type ClosePriceBucket =
  Partial<Record<Ymd, number>> & {
    // 来源信息仅用于诊断，允许以任意字符串作为键，避免各调用点的 string 访问报错
    __sources?: Record<string, string>;
  };

export type ClosePriceMap = Record<string, ClosePriceBucket>;

export type MissingCloseFallback =
  | "MARK_PRICE"
  | "PREVIOUS_CLOSE"
  | "AVERAGE_COST";

export interface MissingCloseEntry {
  symbol: string;
  ymd: string;
  fallback: MissingCloseFallback;
}

export interface PendingCloseDetail {
  symbol: string;
  fallbacks: MissingCloseFallback[];
}

export interface PendingCloseEntry {
  date: string;
  details: PendingCloseDetail[];
  reason: "PRE_CLOSE";
}

export interface MissingCloseRangeOptions {
  from: string;
  to: string;
  entries?: MissingCloseEntry[];
}

export interface CloseWindowDiagnostics {
  date: string;
  isTradingDay: boolean;
  requireOfficialClose: boolean;
  graceMinutes: number;
  windowEndTs: number | null;
  nowTs: number;
  missingClose: boolean;
}

export interface DailyResultsDiagnostics {
  missingCloses: MissingCloseEntry[];
  pendingCloses?: PendingCloseEntry[];
  closeWindow?: CloseWindowDiagnostics;
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

function ensureBucket(map: ClosePriceMap, symbol: string): ClosePriceBucket {
  return (map[symbol] ??= {});
}

function assignPrice(
  bucket: ClosePriceBucket,
  date: string,
  price: number,
  source?: string,
): void {
  if (!isYmd(date)) {
    return;
  }
  const d: Ymd = date;
  bucket[d] = price;
  if (source && source.trim()) {
    (bucket.__sources ??= {})[d] = source.trim();
  } else if (bucket.__sources?.[d]) {
    const { __sources } = bucket;
    delete __sources[d];
    if (Object.keys(__sources).length === 0) {
      delete bucket.__sources;
    }
  }
}

function readSource(bucket: ClosePriceBucket | undefined, date: string): string | undefined {
  return bucket?.__sources?.[date];
}

export interface NormalizeClosePriceOptions {
  defaultSource?: string;
}

export function normalizeClosePriceMap(
  input: ClosePriceMap | Record<string, any> | undefined,
  options: NormalizeClosePriceOptions = {},
): ClosePriceMap {
  const result: ClosePriceMap = {};
  if (!input) return result;
  const { defaultSource } = options;
  for (const [rawSymbol, rawByDate] of Object.entries(input)) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) continue;
    const target = ensureBucket(result, symbol);
    if (!rawByDate || typeof rawByDate !== "object") continue;
    const bucket = rawByDate as ClosePriceBucket & Record<string, any>;
    for (const [rawDate, rawPrice] of Object.entries(bucket)) {
      if (!isValidDateStr(rawDate)) continue;
      let price: number | null = null;
      let source: string | undefined = undefined;
      if (rawPrice && typeof rawPrice === "object") {
        const maybePrice = Number((rawPrice as Record<string, unknown>).price);
        if (Number.isFinite(maybePrice)) {
          price = maybePrice;
        }
        const maybeSource = (rawPrice as Record<string, unknown>).source;
        if (typeof maybeSource === "string" && maybeSource.trim()) {
          source = maybeSource.trim();
        }
      }
      if (price === null) {
        const numeric = Number(rawPrice);
        if (Number.isFinite(numeric)) {
          price = numeric;
        }
      }
      if (price === null) continue;
      const existingSource =
        typeof bucket.__sources?.[rawDate] === "string" && bucket.__sources![rawDate]
          ? bucket.__sources![rawDate]
          : undefined;
      assignPrice(target, rawDate, price, source ?? existingSource ?? defaultSource);
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
    const bucket = ensureBucket(map, symbol);
    assignPrice(bucket, row.date, price, typeof source === "string" ? source : undefined);
  }
  return map;
}

function sourcePriority(source: string | undefined): number {
  if (!source) return 0;
  if (source === "official_overlay" || source.startsWith("official/import/overlay")) {
    return 400;
  }
  if (source.startsWith("official/import")) {
    return 300;
  }
  if (source === "official/packaged" || source === "official/file") {
    return 200;
  }
  if (source.startsWith("official/")) {
    return 150;
  }
  return 100;
}

function isOverlaySource(source: string | undefined): boolean {
  return sourcePriority(source) >= 400;
}

export function mergeClosePriceMaps(...maps: ClosePriceMap[]): ClosePriceMap {
  const result: ClosePriceMap = {};
  for (const map of maps) {
    for (const [symbol, byDate] of Object.entries(map)) {
      const target = ensureBucket(result, symbol);
      for (const date of Object.keys(byDate).filter(isYmd)) {
        const price = byDate[date];
        const numeric = Number(price);
        if (!Number.isFinite(numeric)) continue;
        const candidateSource = readSource(byDate, date);
        const existingSource = readSource(target, date);
        if (existingSource?.startsWith("official/import") && !isOverlaySource(candidateSource)) {
          continue;
        }
        const candidatePriority = sourcePriority(candidateSource);
        const existingPriority = sourcePriority(existingSource);
        if (candidatePriority < existingPriority) {
          continue;
        }
        const sourceToPersist = candidateSource ?? existingSource;
        assignPrice(target, date, numeric, sourceToPersist);
      }
    }
  }
  return result;
}

function normalizeRangeBoundary(value: string): string | null {
  if (isValidDateStr(value)) {
    return value;
  }
  const normalized = toDateStr(value);
  return normalized && isValidDateStr(normalized) ? normalized : null;
}

export async function buildMissingCloseList({
  from,
  to,
  entries = [],
}: MissingCloseRangeOptions): Promise<MissingCloseEntry[]> {
  const start = normalizeRangeBoundary(from);
  const end = normalizeRangeBoundary(to);
  if (!start || !end || entries.length === 0) {
    return [];
  }

  const [lower, upper] = start <= end ? [start, end] : [end, start];
  const tradingDays = new Set<string>();
  for (const day of makeTradingDayRange(lower, upper)) {
    tradingDays.add(day);
  }

  if (tradingDays.size === 0) {
    return [];
  }

  return entries
    .filter((entry) => tradingDays.has(entry.ymd) && isTradingDay(entry.ymd))
    .sort((a, b) => {
      const dayCmp = a.ymd.localeCompare(b.ymd);
      if (dayCmp !== 0) return dayCmp;
      return a.symbol.localeCompare(b.symbol);
    });
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
  const trimmedEval = evalDate?.trim?.() ?? "";
  if (trimmedEval && !isValidDateStr(trimmedEval)) {
    throw new Error(`Invalid evalDate provided: ${evalDate}`);
  }
  const evalDateStr = resolveTradingDayStr(undefined, {
    freeze: trimmedEval || undefined,
  });

  const freezeRaw =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_FREEZE_DATE?.trim()) ||
    (() => {
      const freeze = (globalThis as Record<string, unknown>).NEXT_PUBLIC_FREEZE_DATE;
      return typeof freeze === "string" ? freeze.trim() : "";
    })();
  const freezeEvalDate = freezeRaw
    ? resolveTradingDayStr(undefined, { freeze: freezeRaw })
    : undefined;
  const now = nowNY();
  const closeRequirement = evaluateCloseRequirement(evalDateStr, now);
  const evalIsTradingDay = isTradingDay(evalDateStr);
  const normalizedCloseRequirement = {
    ...closeRequirement,
    isTradingDay: evalIsTradingDay,
    requireOfficialClose: evalIsTradingDay ? closeRequirement.requireOfficialClose : false,
  };
  if (diagnostics) {
    diagnostics.pendingCloses = diagnostics.pendingCloses ?? [];
    diagnostics.closeWindow = {
      ...normalizedCloseRequirement,
      missingClose: false,
    };
  }
  const treatRealtimeAsClose = (() => {
    if (freezeEvalDate) return false;
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
    for (const date of Object.keys(byDate).filter(isYmd)) {
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
          const key = `${entry.ymd}__${entry.symbol}`;
          const current = map.get(key) ?? new Set<MissingCloseFallback>();
          current.add(entry.fallback);
          map.set(key, current);
        }
        return map;
      })()
    : null;
  const pendingTracker = diagnostics
    ? (() => {
        const map = new Map<string, Map<string, Set<MissingCloseFallback>>>();
        for (const entry of diagnostics.pendingCloses ?? []) {
          const bySymbol = new Map<string, Set<MissingCloseFallback>>();
          for (const detail of entry.details) {
            bySymbol.set(detail.symbol, new Set(detail.fallbacks));
          }
          map.set(entry.date, bySymbol);
        }
        return map;
      })()
    : null;
  const ensurePending = (
    symbol: string,
    tradingDate: string,
    fallback: MissingCloseFallback,
  ) => {
    if (!diagnostics || !pendingTracker) return;
    const byDate = pendingTracker.get(tradingDate) ?? new Map<string, Set<MissingCloseFallback>>();
    const set = byDate.get(symbol) ?? new Set<MissingCloseFallback>();
    if (set.has(fallback)) return;
    set.add(fallback);
    byDate.set(symbol, set);
    pendingTracker.set(tradingDate, byDate);

    const order: Record<MissingCloseFallback, number> = {
      MARK_PRICE: 0,
      PREVIOUS_CLOSE: 1,
      AVERAGE_COST: 2,
    };

    let entry = diagnostics.pendingCloses!.find((row) => row.date === tradingDate);
    if (!entry) {
      entry = { date: tradingDate, details: [], reason: "PRE_CLOSE" };
      diagnostics.pendingCloses!.push(entry);
      diagnostics.pendingCloses!.sort((a, b) => a.date.localeCompare(b.date));
    }

    let detail = entry.details.find((row) => row.symbol === symbol);
    if (!detail) {
      detail = { symbol, fallbacks: [] };
      entry.details.push(detail);
      entry.details.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    detail.fallbacks = Array.from(set).sort((a, b) => order[a] - order[b]);
  };
  const reportMissing = (
    symbol: string,
    date: string,
    fallback: MissingCloseFallback,
  ) => {
    if (!diagnostics || !diagTracker) return;
    const resolveEffectiveTradingDate = (target: string): string | null => {
      if (!isValidDateStr(target)) return null;
      if (isTradingDay(target)) return target;
      const prev = previousTradingDay(target);
      return prev || null;
    };
    const effectiveDate = resolveEffectiveTradingDate(date);
    const requireOfficial = (() => {
      if (!effectiveDate) return false;
      if (effectiveDate < evalDateStr) return true;
      if (effectiveDate === evalDateStr) {
        return normalizedCloseRequirement.requireOfficialClose;
      }
      return evaluateCloseRequirement(effectiveDate, now).requireOfficialClose;
    })();

    if (!requireOfficial) {
      if (effectiveDate && effectiveDate === evalDateStr && evalIsTradingDay) {
        ensurePending(symbol, effectiveDate, fallback);
      }
      return;
    }

    if (!effectiveDate) {
      return;
    }

    const key = `${effectiveDate}__${symbol}`;
    const set = diagTracker.get(key) ?? new Set<MissingCloseFallback>();
    if (set.has(fallback)) return;
    set.add(fallback);
    diagTracker.set(key, set);
    diagnostics.missingCloses.push({ symbol, ymd: effectiveDate, fallback });
    if (diagnostics.closeWindow && effectiveDate === diagnostics.closeWindow.date) {
      diagnostics.closeWindow.missingClose = true;
    }
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
      if (price === undefined && date === evalDateStr && treatRealtimeAsClose) {
        const final = finalPriceMap.get(symbol);
        if (final !== undefined && Number.isFinite(final)) {
          price = final;
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
