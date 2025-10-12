import { openDB, DBSchema, IDBPDatabase } from "idb";
import { formatInTimeZone } from "date-fns-tz";
import type { DailyResult } from "@/lib/types";
import { logger } from "@/lib/logger";
import { migrateClosePriceMap } from "@/lib/closePriceMigration";
import { isOfficialCloseFixEnabled } from "@/app/lib/prices/officialCloseFeatureFlag";
import { normalizeOfficialSourceTag } from "@/app/lib/prices/compareOfficialSourcePriority";
import { extractInitialPositionsFromTrades, replayPortfolio } from "../tradeReplay";
import { resolveTradingDayStr } from "../nyDay";
import { toNY, ymdInNY } from "../timezone";
import { NY_TZ, normalizeToNyDay } from "../time";

const DB_NAME = "TradingApp";
const DB_VERSION = 3; // Incremented version for schema change
const TRADES_STORE_NAME = "trades";
const POSITIONS_STORE_NAME = "positions";
const PRICES_STORE_NAME = "prices"; // New store for prices

export const DATASET_HASH_KEY = "dataset:hash";
export const DATASET_SOURCE_KEY = "dataset:source";
export const DATASET_SOURCE_BUILTIN = "builtin";
export const DATASET_SOURCE_CUSTOM = "custom";

const LEGACY_DATASET_SOURCE_KEY = "datasetSource";
const LEGACY_DATASET_HASH_KEY = "datasetHash";

function resolveNyDayString(input: string | Date | number): string {
  if (input instanceof Date) {
    const ny = ymdInNY(input);
    return ISO_DATE_RE.test(ny) ? ny : "";
  }
  if (typeof input === "number") {
    return resolveNyDayString(new Date(input));
  }
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }
  const source = ISO_DATE_RE.test(input) ? `${input}T12:00:00Z` : input;
  const ny = ymdInNY(source);
  return ISO_DATE_RE.test(ny) ? ny : "";
}

export function markDatasetAsCustom(): void {
  try {
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_CUSTOM);
    localStorage.removeItem(DATASET_HASH_KEY);
    localStorage.setItem(LEGACY_DATASET_SOURCE_KEY, DATASET_SOURCE_CUSTOM);
    localStorage.removeItem(LEGACY_DATASET_HASH_KEY);
  } catch {
    /* ignore storage errors */
  }
}

// Matches the structure in trades.json -> trades array
export interface RawTrade {
  date: string; // "2025-07-04"
  symbol: string;
  side?: "BUY" | "SELL" | "SHORT" | "COVER" | string | null;
  qty?: number | string | null;
  quantity?: number | string | null;
  price: number | string;
  action?: string | null;
  time?: string | number | Date;
  datetime?: string | null;
  id?: number;
  pl?: number;
  closed?: boolean;
  isInitialPosition?: boolean;
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
  instrumentType?: string | null;
  /** 合约乘数，默认为 1 */
  multiplier?: number;
  /** 前一交易日的收盘价，用于计算当日价格变动 */
  prevClose?: number;
  /** 含历史盈亏的滚动保本价 */
  breakEvenPrice?: number | null;
  /** 裸 J：实时滚动保本价 */
  breakEvenJ?: number | null;
  /** Sticky J：净仓归零后保留的上一笔 J */
  breakEvenJSticky?: number | null;
  /** 当前保本价对应方向 */
  breakEvenDirection?: 'LONG' | 'SHORT' | null;
  /** Sticky 保本价对应方向 */
  breakEvenDirectionSticky?: 'LONG' | 'SHORT' | null;
}

// New interface for cached prices
export type OfficialCloseSourceTag =
  | "official/import"
  | "official/packaged"
  | "official/exchange"
  | "official/vendor"
  | "official/manual";

export type CachedPriceSource =
  | "finnhub"
  | "alphavantage"
  | "tiingo"
  | "close_rt"
  | "close_fallback"
  | OfficialCloseSourceTag;

export interface CachedPrice {
  symbol: string;
  date: string;
  close: number;
  source: CachedPriceSource;
}

/**
 * @deprecated Prefer normalizeOfficialSourceTag / compareOfficialSourcePriority
 */
export function isOfficialCloseSource(source?: string | null): boolean {
  const normalized = normalizeOfficialSourceTag(source ?? null);
  return normalized.startsWith("official/");
}

/**
 * @deprecated Prefer normalizeOfficialSourceTag / compareOfficialSourcePriority
 */
export function isOfficialImportSource(source?: string | null): boolean {
  const normalized = normalizeOfficialSourceTag(source ?? null);
  return normalized === "official/import";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
const trackedDbConnections = new WeakSet<IDBPDatabase<TradingDB>>();

function resetDbPromiseIfCurrent(db: IDBPDatabase<TradingDB>): void {
  if (!dbPromise) return;
  void dbPromise
    .then((current) => {
      if (current === db) {
        dbPromise = undefined;
      }
    })
    .catch(() => {
      dbPromise = undefined;
    });
}

function attachDbLifecycleHandlers(db: IDBPDatabase<TradingDB>): void {
  if (trackedDbConnections.has(db)) {
    return;
  }
  trackedDbConnections.add(db);

  const handleClose = (): void => {
    logger.warn("[dataService] IndexedDB connection closed; scheduling reopen");
    resetDbPromiseIfCurrent(db);
  };

  db.addEventListener("close", handleClose);
  db.addEventListener("versionchange", () => {
    logger.info("[dataService] IndexedDB version change detected; closing connection");
    db.close();
    resetDbPromiseIfCurrent(db);
  });
}

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
    void dbPromise.then(attachDbLifecycleHandlers).catch((error) => {
      logger.error("[dataService] Failed to open IndexedDB", error);
      dbPromise = undefined;
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

function toUpperSafe(value?: string | number | null): string {
  if (typeof value === "string") {
    return value.trim().toUpperCase();
  }
  if (typeof value === "number") {
    return value.toString().trim().toUpperCase();
  }
  if (value == null) {
    return "";
  }
  return String(value).trim().toUpperCase();
}

export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload ?? null);
  // FNV-1a 32-bit hash for deterministic yet inexpensive hashing
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash.toString(16);
}

export async function getAnyTradeCount(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(TRADES_STORE_NAME, "readonly");
  const store = tx.objectStore(TRADES_STORE_NAME);
  const count = await store.count();
  await tx.done;
  return count;
}

export async function getAnyPositionCount(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(POSITIONS_STORE_NAME, "readonly");
  const store = tx.objectStore(POSITIONS_STORE_NAME);
  const count = await store.count();
  await tx.done;
  return count;
}

function toISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBaselineDate(rawTrades: ImportableTrade[]): string {
  let minYmd: string | null = null;
  for (const trade of rawTrades) {
    const resolved = resolveNyDayString(trade.date);
    if (!resolved) continue;
    if (!minYmd || resolved < minYmd) {
      minYmd = resolved;
    }
  }
  if (!minYmd) {
    return "1900-01-01";
  }
  const nyDate = toNY(`${minYmd}T12:00:00Z`);
  if (Number.isNaN(nyDate.getTime())) {
    return minYmd;
  }
  nyDate.setHours(0, 0, 0, 0);
  nyDate.setDate(nyDate.getDate() - 1);
  const baseline = ymdInNY(nyDate);
  return ISO_DATE_RE.test(baseline) ? baseline : minYmd;
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

function mapRawTrade(
  rawTrade: ImportableTrade,
  options?: { strict?: boolean },
): Trade | undefined {
  const strict = options?.strict ?? false;
  const fail = (message: string): undefined => {
    if (strict) {
      throw new Error(message);
    }
    console.warn(message);
    return undefined;
  };

  const symbol = toUpperSafe((rawTrade as RawTrade).symbol);
  if (!symbol) {
    return fail(`Missing trade symbol: ${String((rawTrade as RawTrade).symbol)}`);
  }

  let action: Trade["action"] | undefined;

  if ("side" in rawTrade) {
    action = parseAction((rawTrade as RawTrade).side);
  }

  if (!action && "action" in rawTrade) {
    action = parseAction((rawTrade as Trade).action);
  }

  if (!action) {
    return fail(
      `Unknown or missing trade side/action: ${String(
        (rawTrade as RawTrade).side ?? (rawTrade as Trade).action,
      )}, skipping.`,
    );
  }

  const qtyValue =
    ("qty" in rawTrade ? coerceNumber(rawTrade.qty) : undefined) ??
    ("quantity" in rawTrade ? coerceNumber(rawTrade.quantity) : undefined);

  if (qtyValue === undefined || !Number.isFinite(qtyValue) || qtyValue === 0) {
    return fail(
      `Missing or invalid trade quantity for ${symbol}, skipping.`,
    );
  }

  const priceValue = coerceNumber(rawTrade.price);
  if (priceValue === undefined || !Number.isFinite(priceValue) || priceValue <= 0) {
    return fail(
      `Missing or invalid trade price for ${symbol}, skipping.`,
    );
  }

  const normalizedQty = Math.abs(qtyValue as number);
  const quantity = action === "short" ? -normalizedQty : normalizedQty;

  const trade: Trade = {
    symbol,
    price: priceValue,
    quantity,
    date: (rawTrade as RawTrade).date,
    action,
  };

  const timeValue =
    (rawTrade as RawTrade).time ?? (rawTrade as RawTrade).datetime ?? undefined;
  if (timeValue !== undefined && timeValue !== null) {
    trade.time = timeValue as Trade["time"];
  }

  if (
    "isInitialPosition" in rawTrade &&
    typeof rawTrade.isInitialPosition === "boolean"
  ) {
    trade.isInitialPosition = rawTrade.isInitialPosition;
  }

  return trade;
}

function normalizePositionsForStore(
  rawPositions: Array<Partial<Position> & Record<string, unknown>>,
): Position[] {
  const normalized: Position[] = [];
  for (const raw of rawPositions) {
    if (!raw) continue;
    const qty = coerceNumber(raw.qty);
    if (qty === undefined || !Number.isFinite(qty) || qty === 0) continue;
    const avgPrice = coerceNumber(raw.avgPrice);
    if (avgPrice === undefined || !Number.isFinite(avgPrice)) continue;
    const lastPrice = coerceNumber(raw.last);
    const prevClose =
      coerceNumber(raw.prevClose) ??
      coerceNumber(raw.previousClose as unknown);
    const absQty = Math.abs(qty);
    const isShort = qty < 0;
    const symbol = toUpperSafe(raw.symbol);
    if (!symbol) continue;
    normalized.push({
      symbol,
      qty: isShort ? -absQty : absQty,
      avgPrice,
      last: lastPrice !== undefined ? lastPrice : avgPrice,
      priceOk: raw.priceOk ?? true,
      stale: raw.stale ?? false,
      lastUpdatedAt: raw.lastUpdatedAt,
      prevClose: prevClose !== undefined ? prevClose : undefined,
    });
  }
  return normalized;
}

type DatasetPayload = {
  positions?: Array<Partial<Position> & Record<string, unknown>>;
  trades?: ImportableTrade[];
};

async function replaceDataset(
  rawData: DatasetPayload,
  options: { source: typeof DATASET_SOURCE_BUILTIN | typeof DATASET_SOURCE_CUSTOM; strict: boolean },
): Promise<void> {
  const db = await getDb();

  const clearTx = db.transaction(
    [TRADES_STORE_NAME, POSITIONS_STORE_NAME],
    "readwrite",
  );
  await Promise.all([
    clearTx.objectStore(TRADES_STORE_NAME).clear(),
    clearTx.objectStore(POSITIONS_STORE_NAME).clear(),
  ]);
  await clearTx.done;

  logger.info("Importing data...");

  const tradesToPersist: Trade[] = [];
  for (const rawTrade of rawData.trades ?? []) {
    const trade = mapRawTrade(rawTrade, { strict: options.strict });
    if (trade) {
      tradesToPersist.push(trade);
    }
  }

  const baselineDate = getBaselineDate(tradesToPersist as ImportableTrade[]);

  const normalizedPositions = normalizePositionsForStore(rawData.positions ?? []);
  for (const position of normalizedPositions) {
    const absQty = Math.abs(position.qty);
    const isShort = position.qty < 0;
    tradesToPersist.push({
      symbol: position.symbol,
      price: position.avgPrice,
      quantity: isShort ? -absQty : absQty,
      date: baselineDate,
      action: isShort ? "short" : "buy",
      isInitialPosition: true,
    });
  }

  if (tradesToPersist.length > 0) {
    const tradesTx = db.transaction(TRADES_STORE_NAME, "readwrite");
    const tradeStore = tradesTx.objectStore(TRADES_STORE_NAME);
    await Promise.all(tradesToPersist.map((trade) => tradeStore.add(trade)));
    await tradesTx.done;
  }

  if (normalizedPositions.length > 0) {
    const positionsTx = db.transaction(POSITIONS_STORE_NAME, "readwrite");
    const positionStore = positionsTx.objectStore(POSITIONS_STORE_NAME);
    await Promise.all(
      normalizedPositions.map((position) => positionStore.put(position)),
    );
    await positionsTx.done;
  }

  clearDailyResultsCache();

  try {
    const datasetHash = hashPayload({
      positions: rawData.positions ?? [],
      trades: rawData.trades ?? [],
    });
    localStorage.setItem(DATASET_HASH_KEY, datasetHash);
    localStorage.setItem(DATASET_SOURCE_KEY, options.source);
  } catch {
    /* ignore storage errors */
  }

  logger.info("Data imported successfully.");
}

export async function importData(rawData: DatasetPayload) {
  await replaceDataset(rawData, {
    source: DATASET_SOURCE_CUSTOM,
    strict: false,
  });
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

export async function clearAndImportData(rawData: DatasetPayload): Promise<void> {
  await replaceDataset(rawData, {
    source: DATASET_SOURCE_BUILTIN,
    strict: true,
  });
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
  if (freeze) {
    return resolveTradingDayStr(undefined, { freeze });
  }
  const lastDaily = daily.reduce(
    (m, r) => (r.date > m ? r.date : m),
    "1900-01-01",
  );
  const lastTrade = lastTradeDateStr ?? "1900-01-01";
  const candidate = lastDaily > lastTrade ? lastDaily : lastTrade;
  const nyDay = resolveNyDayString(candidate);
  if (ISO_DATE_RE.test(nyDay)) {
    return nyDay;
  }
  const fallback = resolveTradingDayStr();
  return ISO_DATE_RE.test(fallback) ? fallback : "";
}

type PersistableTradeInput = Pick<
  Trade,
  "symbol" | "price" | "quantity" | "date" | "action"
> & {
  id?: number;
  time?: Trade["time"];
};

interface PersistableTradePayload {
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: Trade["action"];
  time: string;
  id?: number;
}

const NY_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

function toPersistableTradePayload(
  trade: PersistableTradeInput,
): PersistableTradePayload | undefined {
  const symbol = toUpperSafe(trade.symbol);
  if (!symbol) return undefined;
  const price = Number(trade.price);
  const quantity = Number(trade.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return undefined;
  if (!trade.date) return undefined;
  const action = trade.action;
  if (!action) return undefined;

  const fallbackTime = formatInTimeZone(
    normalizeToNyDay(trade.date),
    NY_TZ,
    NY_TIME_FORMAT,
  );

  let time = fallbackTime;
  const rawTime = trade.time;
  if (rawTime instanceof Date) {
    if (!Number.isNaN(rawTime.getTime())) {
      time = formatInTimeZone(rawTime, NY_TZ, NY_TIME_FORMAT);
    }
  } else if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
    const asDate = new Date(rawTime);
    if (!Number.isNaN(asDate.getTime())) {
      time = formatInTimeZone(asDate, NY_TZ, NY_TIME_FORMAT);
    }
  } else if (typeof rawTime === "string") {
    const trimmed = rawTime.trim();
    if (trimmed) {
      const normalized = normalizeToNyDay(trimmed);
      const parsed =
        normalized instanceof Date
          ? normalized
          : new Date(normalized as string | number);
      if (!Number.isNaN(parsed.getTime())) {
        time = formatInTimeZone(parsed, NY_TZ, NY_TIME_FORMAT);
      }
    }
  }

  const payload: PersistableTradePayload = {
    symbol,
    price,
    quantity,
    date: trade.date,
    action,
    time,
  };

  if (trade.id != null) {
    payload.id = trade.id;
  }

  return payload;
}

async function persistTradesToPrimarySource(
  snapshot?: PersistableTradeInput[],
): Promise<void> {
  if (typeof fetch !== "function") {
    return;
  }

  try {
    const trades = snapshot ?? (await findTrades());
    const payload = trades
      .map((trade) => toPersistableTradePayload(trade))
      .filter((value): value is PersistableTradePayload => Boolean(value));

    const res = await fetch("/api/trades", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trades: payload }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        detail = "";
      }
      logger.warn(
        `[dataService] persist trades failed: ${res.status} ${detail}`.trim(),
      );
    }
  } catch (err) {
    logger.warn("[dataService] persist trades request failed", err);
  }
}

// --- New functions for price cache ---

export async function getPrice(
  symbol: string,
  date: string,
): Promise<CachedPrice | undefined> {
  const db = await getDb();
  return db.get(PRICES_STORE_NAME, [symbol, date]);
}

export async function getImportedCloseMap(symbol: string, date: string) {
  return getPrice((symbol ?? '').trim().toUpperCase(), date);
}

export async function putPrice(price: CachedPrice): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(PRICES_STORE_NAME, "readwrite");
  await tx.store.put(price);
  await tx.done;
}

export async function cleanupMisplacedPriceEntries(): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(PRICES_STORE_NAME, "readwrite");
  const store = tx.objectStore(PRICES_STORE_NAME);
  let cursor = await store.openCursor();
  let removed = 0;

  while (cursor) {
    const value = cursor.value as CachedPrice;
    const key = cursor.key as [string, string];
    const symbol = value?.symbol ?? key?.[0];
    const date = value?.date ?? key?.[1];
    const symbolLooksDate = typeof symbol === "string" && ISO_DATE_RE.test(symbol);
    const dateLooksInvalid = typeof date !== "string" || !ISO_DATE_RE.test(date);

    if (symbolLooksDate || dateLooksInvalid) {
      await cursor.delete();
      removed += 1;
    }

    cursor = await cursor.continue();
  }

  await tx.done;
  if (removed > 0) {
    logger.info(`[dataService] cleaned ${removed} misplaced close price entries`);
  }
  return removed;
}

async function importClosePricesIntoCache(
  map: Record<string, Record<string, number>>,
): Promise<number> {
  let imported = 0;
  const promises: Promise<void>[] = [];

  for (const [symbol, byDate] of Object.entries(map)) {
    if (!byDate || typeof byDate !== "object") continue;
    for (const [date, close] of Object.entries(byDate)) {
      if (!ISO_DATE_RE.test(date) || typeof close !== "number") continue;
      promises.push(
        putPrice({ symbol, date, close, source: "official/import" }),
      );
      imported += 1;
    }
  }

  await Promise.all(promises);
  await cleanupMisplacedPriceEntries();
  clearDailyResultsCache();
  return imported;
}

export async function importClosePrices(
  nestedPrices: Record<string, Record<string, number>> | unknown,
): Promise<number> {
  if (isOfficialCloseFixEnabled()) {
    const facade = await import("@/app/lib/prices/officialCloseFacade");
    const result = await facade.importClosePrices(nestedPrices);
    return result.imported;
  }

  const { map } = migrateClosePriceMap(nestedPrices);
  const imported = await importClosePricesIntoCache(map);
  try {
    const stamp = String(Date.now());
    if (typeof window !== "undefined" && window?.localStorage) {
      window.localStorage.setItem("close_prices_version", stamp);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem("close_prices_version", stamp);
    }
  } catch {
    // ignore storage errors
  }
  return imported;
}

export { importClosePricesIntoCache };

export async function getAllPrices(): Promise<CachedPrice[]> {
  const db = await getDb();
  return db.getAll(PRICES_STORE_NAME);
}

export async function getOfficialCloseMapFromCache(): Promise<Record<string, Record<string, number>>> {
  if (typeof indexedDB === "undefined") {
    return {};
  }
  try {
    const db = await getDb();
    const rows = await db.getAll(PRICES_STORE_NAME);
    const map: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!row || !isOfficialCloseSource(row.source)) {
        continue;
      }
      const symbol = toUpperSafe(row.symbol);
      const date =
        typeof row.date === "string" && row.date
          ? resolveNyDayString(row.date)
          : "";
      if (!symbol || !date) {
        continue;
      }
      const price = Number(row.close);
      if (!Number.isFinite(price)) {
        continue;
      }
      (map[symbol] ??= {})[date] = price;
    }
    return map;
  } catch (error) {
    logger.warn("[dataService] getOfficialCloseMapFromCache failed", error);
    return {};
  }
}

export async function addTrade(trade: Trade): Promise<number> {
  const db = await getDb();
  const id = await db.add(TRADES_STORE_NAME, trade as Trade);
  clearDailyResultsCache();
  markDatasetAsCustom();
  await persistTradesToPrimarySource();
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
  markDatasetAsCustom();
  await persistTradesToPrimarySource();
}

export async function deleteTrade(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(TRADES_STORE_NAME, id);
  clearDailyResultsCache();
  markDatasetAsCustom();
  await persistTradesToPrimarySource();
}

export const __test__ = {
  toPersistableTradePayload,
};
