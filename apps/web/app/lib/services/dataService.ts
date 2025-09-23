import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { DailyResult } from "@/lib/types";
import { logger } from "@/lib/logger";
import { extractInitialPositionsFromTrades, replayPortfolio } from "../tradeReplay";

const DB_NAME = "TradingApp";
const DB_VERSION = 3; // Incremented version for schema change
const TRADES_STORE_NAME = "trades";
const POSITIONS_STORE_NAME = "positions";
const PRICES_STORE_NAME = "prices"; // New store for prices

export const DATASET_HASH_KEY = "dataset-hash";
export const DATASET_SOURCE_KEY = "dataset-source";
export const DATASET_SOURCE_BUILTIN = "builtin";
export const DATASET_SOURCE_CUSTOM = "custom";

// Matches the structure in trades.json -> trades array
export interface RawTrade {
  date: string; // "2025-07-04"
  symbol: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  qty: number;
  price: number;
  pl?: number;
  closed?: boolean;
}

// Matches the structure in trades.json -> positions array
export interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  last: number;
  priceOk: boolean;
  stale?: boolean;
  lastUpdatedAt?: number;
}

// New interface for cached prices
export interface CachedPrice {
  symbol: string;
  date: string;
  close: number;
  source: "finnhub" | "alphavantage" | "import" | "tiingo" | "close_rt";
}

// Interface for metricsDaily records
// Internal representation, adapted for the app
export interface Trade {
  id?: number;
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  time?: string | number | Date;
  action: "buy" | "sell" | "short" | "cover";
  isInitialPosition?: boolean;
}

type ImportableTrade = RawTrade | Trade;

interface TradingDB extends DBSchema {
  [TRADES_STORE_NAME]: {
    key: number;
    value: Trade;
    indexes: { "by-date": string };
  };
  [POSITIONS_STORE_NAME]: {
    key: string;
    value: Position;
  };
  [PRICES_STORE_NAME]: {
    key: [string, string]; // [symbol, date]
    value: CachedPrice;
    indexes: { "by-symbol": string };
  };
}

let dbPromise: Promise<IDBPDatabase<TradingDB>> | undefined;

let cachedDailyResults: DailyResult[] = [];

function getDb(): Promise<IDBPDatabase<TradingDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TradingDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains(TRADES_STORE_NAME)) {
            const store = db.createObjectStore(TRADES_STORE_NAME, {
              keyPath: "id",
              autoIncrement: true,
            });
            store.createIndex("by-date", "date");
          }
          if (!db.objectStoreNames.contains(POSITIONS_STORE_NAME)) {
            db.createObjectStore(POSITIONS_STORE_NAME, { keyPath: "symbol" });
          }
        }
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains(PRICES_STORE_NAME)) {
            db.deleteObjectStore(PRICES_STORE_NAME);
          }
          const store = db.createObjectStore(PRICES_STORE_NAME, {
            keyPath: ["symbol", "date"],
          });
          store.createIndex("by-symbol", "symbol");
        }
      },
    });
  }
  return dbPromise!;
}

export async function closeDb(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = undefined;
  }
}

async function computeDataHash(data: unknown): Promise<string> {
  const json = JSON.stringify(data);
  try {
    if (typeof crypto?.subtle !== "undefined") {
      const buffer = new TextEncoder().encode(json);
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    /* ignore */
  }
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash + json.charCodeAt(i)) % 0xfffffff;
  }
  return hash.toString();
}

function toISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBaselineDate(rawTrades: ImportableTrade[]): string {
  let minTime = Number.POSITIVE_INFINITY;
  for (const trade of rawTrades) {
    const d = new Date(`${trade.date}T00:00:00Z`);
    const time = d.getTime();
    if (Number.isFinite(time) && time < minTime) {
      minTime = time;
    }
  }
  if (!Number.isFinite(minTime)) {
    return "1900-01-01";
  }
  const baselineDate = new Date(minTime - 24 * 60 * 60 * 1000);
  return toISODate(baselineDate);
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const normalized = trimmed.replace(/,/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

const ACTION_ALIASES: Record<string, Trade["action"]> = {
  BUY: "buy",
  BUY_TO_OPEN: "buy",
  BUYTOOPEN: "buy",
  BOT: "buy",
  BTO: "buy",
  SELL: "sell",
  SELL_TO_CLOSE: "sell",
  SELLTOCLOSE: "sell",
  STC: "sell",
  SLD: "sell",
  SHORT: "short",
  SELL_SHORT: "short",
  SELLSHORT: "short",
  SELL_TO_OPEN: "short",
  SELLTOOPEN: "short",
  STO: "short",
  COVER: "cover",
  BUY_TO_CLOSE: "cover",
  BUYTOCLOSE: "cover",
  BTC: "cover",
  COVER_SHORT: "cover",
  COVERSHORT: "cover",
};

function normalizeAction(value: string): string {
  return value
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z_]/gi, "")
    .toUpperCase();
}

function parseAction(value: unknown): Trade["action"] | undefined {
  if (typeof value !== "string") return undefined;
  const key = normalizeAction(value);
  return ACTION_ALIASES[key];
}

function mapRawTrade(rawTrade: ImportableTrade): Trade | undefined {
  let action: Trade["action"] | undefined;

  if ("side" in rawTrade) {
    action = parseAction((rawTrade as RawTrade).side);
  }

  if (!action && "action" in rawTrade) {
    action = parseAction((rawTrade as Trade).action);
  }

  if (!action) {
    console.warn(
      `Unknown or missing trade side/action: ${String(
        (rawTrade as RawTrade).side ?? (rawTrade as Trade).action,
      )}, skipping.`,
    );
    return undefined;
  }

  const qtyValue =
    ("qty" in rawTrade ? coerceNumber(rawTrade.qty) : undefined) ??
    ("quantity" in rawTrade ? coerceNumber(rawTrade.quantity) : undefined);

  if (qtyValue === undefined || !Number.isFinite(qtyValue)) {
    console.warn(
      `Missing or invalid trade quantity for ${rawTrade.symbol}, skipping.`,
    );
    return undefined;
  }

  const priceValue = coerceNumber(rawTrade.price);
  if (priceValue === undefined || !Number.isFinite(priceValue)) {
    console.warn(
      `Missing or invalid trade price for ${rawTrade.symbol}, skipping.`,
    );
    return undefined;
  }

  const normalizedQty = Math.abs(qtyValue as number);
  const quantity = action === "short" ? -normalizedQty : normalizedQty;

  const trade: Trade = {
    symbol: rawTrade.symbol,
    price: priceValue,
    quantity,
    date: rawTrade.date,
    action,
  };

  if ("time" in rawTrade && rawTrade.time !== undefined) {
    trade.time = rawTrade.time as Trade["time"];
  }

  if (
    "isInitialPosition" in rawTrade &&
    typeof rawTrade.isInitialPosition === "boolean"
  ) {
    trade.isInitialPosition = rawTrade.isInitialPosition;
  }

  return trade;
}

function normalizePositionsForStore(rawPositions: Position[]): Position[] {
  const normalized: Position[] = [];
  for (const raw of rawPositions) {
    if (!raw) continue;
    const qty = coerceNumber(raw.qty);
    if (qty === undefined || !Number.isFinite(qty) || qty === 0) continue;
    const avgPrice = coerceNumber(raw.avgPrice);
    if (avgPrice === undefined || !Number.isFinite(avgPrice)) continue;
    const lastPrice = coerceNumber(raw.last);
    const absQty = Math.abs(qty);
    const isShort = qty < 0;
    normalized.push({
      symbol: raw.symbol,
      qty: isShort ? -absQty : absQty,
      avgPrice,
      last: lastPrice !== undefined ? lastPrice : avgPrice,
      priceOk: raw.priceOk ?? true,
      stale: raw.stale ?? false,
      lastUpdatedAt: raw.lastUpdatedAt,
    });
  }
  return normalized;
}

export async function importData(rawData: {
  positions: Position[];
  trades: ImportableTrade[];
}) {
  const newHash = await computeDataHash(rawData);
  let storedHash: string | null = null;
  try {
    storedHash = localStorage.getItem(DATASET_HASH_KEY);
  } catch {
    /* localStorage unavailable */
  }

  if (storedHash !== newHash) {
    await clearAllData();
    try {
      localStorage.setItem(DATASET_HASH_KEY, newHash);
      localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    } catch {
      /* ignore */
    }
  } else {
    logger.info("Dataset unchanged. Skipping import.");
    return;
  }

  const db = await getDb();

  logger.info("Importing data...");
  const tx = db.transaction(TRADES_STORE_NAME, "readwrite");
  const tradeStore = tx.objectStore(TRADES_STORE_NAME);

  const baselineDate = getBaselineDate(rawData.trades);

  const tradesToImport: Trade[] = [];
  for (const rawTrade of rawData.trades) {
    const trade = mapRawTrade(rawTrade);
    if (trade) {
      tradesToImport.push(trade);
    }
  }

  for (const position of rawData.positions) {
    const qtyValue = coerceNumber(position.qty);
    if (qtyValue === undefined || !Number.isFinite(qtyValue) || qtyValue === 0)
      continue;
    const avgPrice = coerceNumber(position.avgPrice);
    if (avgPrice === undefined || !Number.isFinite(avgPrice)) continue;
    const absQty = Math.abs(qtyValue);
    const isShort = qtyValue < 0;
    tradesToImport.push({
      symbol: position.symbol,
      price: avgPrice,
      quantity: isShort ? -absQty : absQty,
      date: baselineDate,
      action: isShort ? "short" : "buy",
      isInitialPosition: true,
    });
  }

  await Promise.all(tradesToImport.map((trade) => tradeStore.add(trade)));
  await tx.done;

  const positionsToStore = normalizePositionsForStore(rawData.positions);
  if (positionsToStore.length > 0) {
    const positionsTx = db.transaction(POSITIONS_STORE_NAME, "readwrite");
    const positionStore = positionsTx.objectStore(POSITIONS_STORE_NAME);
    await Promise.all(
      positionsToStore.map((position) => positionStore.put(position)),
    );
    await positionsTx.done;
  }
  logger.info("Data imported successfully.");
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    [TRADES_STORE_NAME, POSITIONS_STORE_NAME, PRICES_STORE_NAME],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore(TRADES_STORE_NAME).clear(),
    tx.objectStore(POSITIONS_STORE_NAME).clear(),
    tx.objectStore(PRICES_STORE_NAME).clear(),
  ]);
  await tx.done;
  clearDailyResultsCache();
  logger.info("All trade, position, and price data cleared.");
}

export async function clearAndImportData(rawData: {
  positions: Position[];
  trades: ImportableTrade[];
}): Promise<void> {
  await clearAllData();

  const db = await getDb();
  logger.info("Importing data...");
  const tx = db.transaction(TRADES_STORE_NAME, "readwrite");
  const tradeStore = tx.objectStore(TRADES_STORE_NAME);

  const baselineDate = getBaselineDate(rawData.trades);

  const tradesToImport: Trade[] = [];
  for (const rawTrade of rawData.trades) {
    const trade = mapRawTrade(rawTrade);
    if (trade) {
      tradesToImport.push(trade);
    }
  }

  for (const position of rawData.positions) {
    const qtyValue = coerceNumber(position.qty);
    if (qtyValue === undefined || !Number.isFinite(qtyValue) || qtyValue === 0)
      continue;
    const avgPrice = coerceNumber(position.avgPrice);
    if (avgPrice === undefined || !Number.isFinite(avgPrice)) continue;
    const absQty = Math.abs(qtyValue);
    const isShort = qtyValue < 0;
    tradesToImport.push({
      symbol: position.symbol,
      price: avgPrice,
      quantity: isShort ? -absQty : absQty,
      date: baselineDate,
      action: isShort ? "short" : "buy",
      isInitialPosition: true,
    });
  }

  await Promise.all(tradesToImport.map((trade) => tradeStore.add(trade)));
  await tx.done;

  const positionsToStore = normalizePositionsForStore(rawData.positions);
  if (positionsToStore.length > 0) {
    const positionsTx = db.transaction(POSITIONS_STORE_NAME, "readwrite");
    const positionStore = positionsTx.objectStore(POSITIONS_STORE_NAME);
    await Promise.all(
      positionsToStore.map((position) => positionStore.put(position)),
    );
    await positionsTx.done;
  }
  clearDailyResultsCache();
  try {
    const newHash = await computeDataHash(rawData);
    localStorage.setItem(DATASET_HASH_KEY, newHash);
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_CUSTOM);
  } catch {
    /* ignore */
  }
  logger.info("Data imported successfully after clearing.");
}

export async function exportData(): Promise<{
  positions: Position[];
  trades: Trade[];
}> {
  const trades = await findTrades();
  const initialPositions = extractInitialPositionsFromTrades(trades).map(
    ({ symbol, qty, avgPrice }) => ({
      symbol,
      qty,
      avgPrice,
      last: avgPrice,
      priceOk: true,
    }),
  );
  return { positions: initialPositions, trades };
}

export async function findTrades(): Promise<Trade[]> {
  const db = await getDb();
  const tx = db.transaction(TRADES_STORE_NAME, "readonly");
  const store = tx.objectStore(TRADES_STORE_NAME);
  const list: Trade[] = [];
  let cursor = await store.openCursor();

  while (cursor) {
    const trade = cursor.value as Trade;
    const id = cursor.key as number;
    list.push({ ...trade, id });
    cursor = await cursor.continue();
  }
  return list;
}

export async function findPositions(): Promise<Position[]> {
  const trades = await findTrades();
  const replay = replayPortfolio(trades);
  return replay.positions;
}

export async function loadDailyResults(): Promise<DailyResult[]> {
  return cachedDailyResults.slice();
}

export function setDailyResultsCache(results: DailyResult[]): void {
  cachedDailyResults = results.slice();
}

export function clearDailyResultsCache(): void {
  cachedDailyResults = [];
}

export function getEvalDateStr(
  daily: DailyResult[],
  lastTradeDateStr?: string,
) {
  const freeze = process.env.NEXT_PUBLIC_FREEZE_DATE?.trim();
  if (freeze) return freeze.slice(0, 10);
  const lastDaily = daily.reduce(
    (m, r) => (r.date > m ? r.date : m),
    "1900-01-01",
  );
  const lastTrade = lastTradeDateStr ?? "1900-01-01";
  return (lastDaily > lastTrade ? lastDaily : lastTrade).slice(0, 10);
}

// --- New functions for price cache ---

export async function getPrice(
  symbol: string,
  date: string,
): Promise<CachedPrice | undefined> {
  const db = await getDb();
  return db.get(PRICES_STORE_NAME, [symbol, date]);
}

export async function putPrice(price: CachedPrice): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PRICES_STORE_NAME, "readwrite");
  await tx.store.put(price);
  await tx.done;
}

export async function importClosePrices(
  nestedPrices: Record<string, Record<string, number>>,
): Promise<number> {
  // nestedPrices format: { '2025-07-05': { 'AAPL': 123.45, ... }, ... }
  let imported = 0;
  const promises: Promise<void>[] = [];
  for (const date in nestedPrices) {
    const dayObj = nestedPrices[date];
    if (dayObj && typeof dayObj === "object") {
      for (const symbol in dayObj) {
        const close = dayObj[symbol];
        if (typeof close === "number") {
          promises.push(putPrice({ symbol, date, close, source: "import" }));
          imported++;
        }
      }
    }
  }
  await Promise.all(promises);
  clearDailyResultsCache();
  return imported;
}

export async function getAllPrices(): Promise<CachedPrice[]> {
  const db = await getDb();
  return db.getAll(PRICES_STORE_NAME);
}

export async function addTrade(trade: Trade): Promise<number> {
  const db = await getDb();
  const id = await db.add(TRADES_STORE_NAME, trade as Trade);
  clearDailyResultsCache();
  return id;
}

// Update existing trade (by id)
export async function updateTrade(trade: Trade): Promise<void> {
  if (trade.id == null) throw new Error("Trade id is required for update");
  const db = await getDb();
  logger.info("更新交易:", trade);
  await db.put(TRADES_STORE_NAME, trade);
  logger.info("交易更新成功");
  clearDailyResultsCache();
}

export async function deleteTrade(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(TRADES_STORE_NAME, id);
  clearDailyResultsCache();
}
