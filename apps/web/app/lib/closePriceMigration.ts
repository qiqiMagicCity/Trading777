import { safeLocalStorage, lsGet, lsSet } from "@/lib/env";
import { toNY, ymdInNY } from "@/lib/timezone";

export type ClosePriceMap = Record<string, Record<string, number>>;

export interface ClosePriceMigrationStats {
  mutated: boolean;
  normalizedSymbols: number;
  convertedUtcKeys: number;
  droppedEntries: number;
  mergedConflicts: number;
  detectedDateBuckets: number;
}

const MIGRATION_FLAG_KEY = "close.ny_migrated_v1";
let memoryFlag = false;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

const normalizeSymbol = (input: string): string => input.trim().toUpperCase();

const readFlag = (): boolean => {
  const ls = safeLocalStorage();
  if (!ls) return memoryFlag;
  const raw = lsGet(MIGRATION_FLAG_KEY);
  return raw === "true" || raw === "1";
};

const writeFlag = () => {
  const ls = safeLocalStorage();
  if (!ls) {
    memoryFlag = true;
    return;
  }
  lsSet(MIGRATION_FLAG_KEY, "true");
};

export const __resetClosePriceMigrationFlagForTest = () => {
  memoryFlag = false;
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(MIGRATION_FLAG_KEY);
  } catch {
    // ignore
  }
};

const normalizeDateKey = (key: string): { date: string; converted: boolean } | null => {
  if (DATE_ONLY_RE.test(key)) {
    return { date: key, converted: false };
  }
  const isoMatch = ISO_DATE_RE.exec(key);
  if (isoMatch) {
    const candidate = isoMatch[1]!;
    if (DATE_ONLY_RE.test(candidate)) {
      return { date: candidate, converted: true };
    }
  }
  const asDate = new Date(key);
  if (Number.isNaN(asDate.getTime())) return null;
  const ny = toNY(asDate);
  return { date: ymdInNY(ny), converted: true };
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const ensureSymbolBucket = (
  map: ClosePriceMap,
  symbol: string,
): Record<string, number> => map[symbol] ?? (map[symbol] = {});

const handleSymbolFirst = (
  output: ClosePriceMap,
  symbol: string,
  source: unknown,
  stats: ClosePriceMigrationStats,
) => {
  if (!source || typeof source !== "object") return;
  const bucket = source as Record<string, unknown>;
  const target = ensureSymbolBucket(output, symbol);
  for (const [rawDate, rawPrice] of Object.entries(bucket)) {
    const normalizedDate = normalizeDateKey(rawDate);
    if (!normalizedDate) {
      stats.droppedEntries += 1;
      continue;
    }
    if (normalizedDate.converted) {
      stats.convertedUtcKeys += 1;
    }
    const price = coerceNumber(rawPrice);
    if (price === null) {
      stats.droppedEntries += 1;
      continue;
    }
    if (target[normalizedDate.date] !== undefined) {
      stats.mergedConflicts += 1;
    }
    target[normalizedDate.date] = price;
  }
};

const handleDateFirst = (
  output: ClosePriceMap,
  rawDate: string,
  source: unknown,
  stats: ClosePriceMigrationStats,
) => {
  const normalizedDate = normalizeDateKey(rawDate);
  if (!normalizedDate) {
    stats.droppedEntries += 1;
    return;
  }
  stats.detectedDateBuckets += 1;
  const bucket = source && typeof source === "object" ? (source as Record<string, unknown>) : null;
  if (!bucket) return;
  for (const [rawSymbol, rawPrice] of Object.entries(bucket)) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) continue;
    const price = coerceNumber(rawPrice);
    if (price === null) {
      stats.droppedEntries += 1;
      continue;
    }
    const target = ensureSymbolBucket(output, symbol);
    if (target[normalizedDate.date] !== undefined) {
      // 纽约桶优先，只有在尚未写入时才填充
      continue;
    }
    if (normalizedDate.converted) {
      stats.convertedUtcKeys += 1;
    }
    target[normalizedDate.date] = price;
  }
};

export interface MigrationResult {
  map: ClosePriceMap;
  stats: ClosePriceMigrationStats;
}

export const migrateClosePriceMap = (input: unknown): MigrationResult => {
  const stats: ClosePriceMigrationStats = {
    mutated: false,
    normalizedSymbols: 0,
    convertedUtcKeys: 0,
    droppedEntries: 0,
    mergedConflicts: 0,
    detectedDateBuckets: 0,
  };
  const output: ClosePriceMap = {};
  if (!input || typeof input !== "object") {
    return { map: output, stats };
  }
  const source = input as Record<string, unknown>;
  for (const [rawKey, value] of Object.entries(source)) {
    if (DATE_ONLY_RE.test(rawKey) || ISO_DATE_RE.test(rawKey)) {
      handleDateFirst(output, rawKey, value, stats);
      continue;
    }
    const symbol = normalizeSymbol(rawKey);
    if (!symbol) continue;
    stats.normalizedSymbols += symbol !== rawKey ? 1 : 0;
    handleSymbolFirst(output, symbol, value, stats);
  }
  stats.mutated =
    stats.normalizedSymbols > 0 ||
    stats.convertedUtcKeys > 0 ||
    stats.detectedDateBuckets > 0 ||
    stats.mergedConflicts > 0 ||
    stats.droppedEntries > 0;
  if (stats.mutated && !readFlag()) {
    writeFlag();
  }
  return { map: output, stats };
};

export const hasClosePriceMigrationRun = (): boolean => readFlag();
