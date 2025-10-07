import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ClosePriceMap } from "@/app/lib/dailyResults";

if (typeof globalThis.structuredClone !== "function") {
  (globalThis as any).structuredClone = <T>(value: T): T =>
    value == null ? value : JSON.parse(JSON.stringify(value));
}

export type OfficialCloseOverlaySource = "official_overlay";

export interface OfficialCloseOverlayRecord {
  symbol: string;
  date: string;
  price: number;
  tsCreated: number;
  tsUpdated: number;
  source: OfficialCloseOverlaySource;
}

interface OverlayDB extends DBSchema {
  overlays: {
    key: [string, string];
    value: OfficialCloseOverlayRecord;
    indexes: {
      "by-date": string;
      "by-symbol": string;
    };
  };
}

const DB_NAME = "TradingOfficialCloseOverlay";
const DB_VERSION = 1;
const STORE_NAME = "overlays";

let dbPromise: Promise<IDBPDatabase<OverlayDB> | null> | null = null;

const overlayCache = new Map<string, OfficialCloseOverlayRecord>();
const listeners = new Set<() => void>();

const SYMBOL_RE = /^[A-Z0-9_.-]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSymbol(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || !SYMBOL_RE.test(trimmed)) return "";
  return trimmed;
}

function normalizeDate(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!DATE_RE.test(trimmed)) return "";
  return trimmed;
}

function normalizePrice(value: number | string | null | undefined): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  return num;
}

function mapKey(symbol: string, date: string): string {
  return `${symbol}|${date}`;
}

function ensureDb(): Promise<IDBPDatabase<OverlayDB> | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }
  dbPromise = openDB<OverlayDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ["symbol", "date"],
        });
        store.createIndex("by-date", "date");
        store.createIndex("by-symbol", "symbol");
      }
    },
  }).catch((error) => {
    console.warn("[officialCloseOverlay] openDB failed", error);
    return null;
  });
  return dbPromise;
}

function updateCacheEntry(entry: OfficialCloseOverlayRecord | null): void {
  if (!entry) return;
  const key = mapKey(entry.symbol, entry.date);
  overlayCache.set(key, entry);
}

function removeCacheEntry(symbol: string, date: string): void {
  overlayCache.delete(mapKey(symbol, date));
}

function refreshCache(entries: OfficialCloseOverlayRecord[]): void {
  overlayCache.clear();
  for (const entry of entries) {
    updateCacheEntry(entry);
  }
}

function notify(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch (error) {
      console.error("[officialCloseOverlay] listener failed", error);
    }
  }
}

export function subscribeOfficialCloseOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function clearOfficialCloseOverlayStore(): Promise<void> {
  overlayCache.clear();
  const db = await ensureDb();
  if (!db) {
    return;
  }
  const tx = db.transaction(STORE_NAME, "readwrite");
  await tx.store.clear();
  await tx.done;
  notify();
}

export async function readOfficialCloseOverlay(): Promise<OfficialCloseOverlayRecord[]> {
  const db = await ensureDb();
  if (!db) {
    const entries = Array.from(overlayCache.values());
    return entries.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.symbol.localeCompare(b.symbol);
    });
  }
  const tx = db.transaction(STORE_NAME, "readonly");
  const entries = await tx.store.getAll();
  await tx.done;
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.symbol.localeCompare(b.symbol);
  });
  refreshCache(entries);
  return entries;
}

export async function putOfficialCloseOverlays(
  entries: Array<{ symbol: string; date: string; price: number }>,
): Promise<OfficialCloseOverlayRecord[]> {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const normalized = new Map<string, OfficialCloseOverlayRecord>();
  const now = Date.now();
  for (const entry of entries) {
    const symbol = normalizeSymbol(entry?.symbol as string);
    const date = normalizeDate(entry?.date as string);
    const price = normalizePrice(entry?.price as number);
    if (!symbol || !date || !Number.isFinite(price)) {
      continue;
    }
    const key = mapKey(symbol, date);
    const existing = overlayCache.get(key);
    normalized.set(key, {
      symbol,
      date,
      price,
      tsCreated: existing?.tsCreated ?? now,
      tsUpdated: now,
      source: "official_overlay",
    });
  }
  if (normalized.size === 0) return [];

  const db = await ensureDb();
  if (!db) {
    const results = Array.from(normalized.values());
    for (const record of results) {
      updateCacheEntry(record);
    }
    notify();
    return results;
  }

  const tx = db.transaction(STORE_NAME, "readwrite");
  for (const record of normalized.values()) {
    await tx.store.put(record);
    updateCacheEntry(record);
  }
  await tx.done;
  const results = Array.from(normalized.values());
  notify();
  return results;
}

export async function removeOfficialCloseOverlay(
  entry: { symbol: string; date: string },
): Promise<void> {
  const symbol = normalizeSymbol(entry?.symbol as string);
  const date = normalizeDate(entry?.date as string);
  if (!symbol || !date) return;
  const db = await ensureDb();
  if (db) {
    const tx = db.transaction(STORE_NAME, "readwrite");
    await tx.store.delete([symbol, date]);
    await tx.done;
  }
  removeCacheEntry(symbol, date);
  notify();
}

export function getOfficialCloseOverlayPrice(
  symbol: string,
  date: string,
): number | undefined {
  const key = mapKey(normalizeSymbol(symbol), normalizeDate(date));
  const record = overlayCache.get(key);
  return record?.price;
}

export function overlayEntriesToMap(
  entries: OfficialCloseOverlayRecord[],
): ClosePriceMap {
  const map: ClosePriceMap = {};
  for (const entry of entries) {
    if (!map[entry.symbol]) {
      map[entry.symbol] = {};
    }
    map[entry.symbol]![entry.date] = entry.price;
  }
  return map;
}

export function overlayCacheToMap(): ClosePriceMap {
  return overlayEntriesToMap(Array.from(overlayCache.values()));
}
