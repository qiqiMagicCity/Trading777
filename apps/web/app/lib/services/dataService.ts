import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { DailyResult } from "@/lib/types";

const DB_NAME = "TradingApp";
const DB_VERSION = 3; // Incremented version for schema change
const TRADES_STORE_NAME = "trades";
const POSITIONS_STORE_NAME = "positions";
const PRICES_STORE_NAME = "prices"; // New store for prices

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
}

// New interface for cached prices
export interface CachedPrice {
  symbol: string;
  date: string;
  close: number;
  source: "finnhub" | "alphavantage" | "import" | "tiingo";
}

// Interface for metricsDaily records
// Internal representation, adapted for the app
export interface Trade {
  id?: number;
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: "buy" | "sell" | "short" | "cover";
}

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

export async function importData(rawData: {
  positions: Position[];
  trades: RawTrade[];
}) {
  const newHash = await computeDataHash(rawData);
  let storedHash: string | null = null;
  try {
    storedHash = localStorage.getItem("dataset-hash");
  } catch {
    /* localStorage unavailable */
  }

  if (storedHash !== newHash) {
    await clearAllData();
    try {
      localStorage.setItem("dataset-hash", newHash);
    } catch {
      /* ignore */
    }
  } else {
    console.log("Dataset unchanged. Skipping import.");
    return;
  }

  const db = await getDb();

  console.log("Importing data...");
  const tx = db.transaction(
    [TRADES_STORE_NAME, POSITIONS_STORE_NAME],
    "readwrite",
  );

  // Import trades
  const tradeStore = tx.objectStore(TRADES_STORE_NAME);
  const tradePromises: Promise<unknown>[] = [];
  const sideMap: Record<RawTrade["side"], Trade["action"]> = {
    BUY: "buy",
    SELL: "sell",
    SHORT: "short",
    COVER: "cover",
  };
  for (const rawTrade of rawData.trades) {
    const sideValue = rawTrade?.side;
    const sideKey =
      typeof sideValue === "string" ? sideValue.toUpperCase() : undefined;
    const action = sideKey
      ? sideMap[sideKey as keyof typeof sideMap]
      : undefined;
    if (!action) {
      console.warn(
        `Unknown or missing trade side: ${String(sideValue)}, skipping.`,
      );
      continue;
    }
    const quantity = action === "short" ? -Math.abs(rawTrade.qty) : Math.abs(rawTrade.qty);
    const trade: Trade = {
      symbol: rawTrade.symbol,
      price: rawTrade.price,
      quantity,
      date: rawTrade.date,
      action,
    };
    tradePromises.push(tradeStore.add(trade));
  }

  // Import positions, enforcing negative quantity for symbols with short trades
  const shortSymbols = new Set(
    rawData.trades
      .filter((t) => t.side?.toUpperCase() === "SHORT")
      .map((t) => t.symbol),
  );
  const positionStore = tx.objectStore(POSITIONS_STORE_NAME);
  const positionPromises = rawData.positions.map((position) => {
    const qty = shortSymbols.has(position.symbol)
      ? -Math.abs(position.qty)
      : position.qty;
    return positionStore.put({ ...position, qty });
  });

  await Promise.all([...tradePromises, ...positionPromises]);
  await tx.done;
  console.log("Data imported successfully.");
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
  console.log("All trade, position, and price data cleared.");
}

export async function clearAndImportData(rawData: {
  positions: Position[];
  trades: RawTrade[];
}): Promise<void> {
  await clearAllData();

  const db = await getDb();
  console.log("Importing data...");
  const tx = db.transaction(
    [TRADES_STORE_NAME, POSITIONS_STORE_NAME],
    "readwrite",
  );

  const tradeStore = tx.objectStore(TRADES_STORE_NAME);
  const tradePromises: Promise<unknown>[] = [];
  const sideMap: Record<RawTrade["side"], Trade["action"]> = {
    BUY: "buy",
    SELL: "sell",
    SHORT: "short",
    COVER: "cover",
  };
  for (const rawTrade of rawData.trades) {
    const sideValue = rawTrade?.side;
    const sideKey =
      typeof sideValue === "string" ? sideValue.toUpperCase() : undefined;
    const action = sideKey
      ? sideMap[sideKey as keyof typeof sideMap]
      : undefined;
    if (!action) {
      console.warn(
        `Unknown or missing trade side: ${String(sideValue)}, skipping.`,
      );
      continue;
    }
    const quantity = action === "short" ? -Math.abs(rawTrade.qty) : Math.abs(rawTrade.qty);
    const trade: Trade = {
      symbol: rawTrade.symbol,
      price: rawTrade.price,
      quantity,
      date: rawTrade.date,
      action,
    };
    tradePromises.push(tradeStore.add(trade));
  }

  const shortSymbols = new Set(
    rawData.trades
      .filter((t) => t.side?.toUpperCase() === "SHORT")
      .map((t) => t.symbol),
  );
  const positionStore = tx.objectStore(POSITIONS_STORE_NAME);
  const positionPromises = rawData.positions.map((position) => {
    const qty = shortSymbols.has(position.symbol)
      ? -Math.abs(position.qty)
      : position.qty;
    return positionStore.add({ ...position, qty });
  });

  await Promise.all([...tradePromises, ...positionPromises]);
  await tx.done;
  try {
    const newHash = await computeDataHash(rawData);
    localStorage.setItem("dataset-hash", newHash);
  } catch {
    /* ignore */
  }
  console.log("Data imported successfully after clearing.");
}

export async function exportData(): Promise<{
  positions: Position[];
  trades: Trade[];
}> {
  const [positions, trades] = await Promise.all([
    findPositions(),
    findTrades(),
  ]);
  return { positions, trades };
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
  const db = await getDb();
  return db.getAll(POSITIONS_STORE_NAME);
}

const toNum = (v: any) => (Number.isFinite(+v) ? +v : 0);

export async function loadDailyResults(): Promise<DailyResult[]> {
  try {
    const res = await fetch("/dailyResult.json", { cache: "no-store" });
    const raw = await res.json();
    const arr: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];
    const map = new Map<string, DailyResult>();
    for (const x of arr) {
      const d = String(x.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      map.set(d, {
        date: d,
        realized: toNum(x.realized),
        unrealized: toNum(x.unrealized),
      });
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch (e) {
    console.warn("loadDailyResults failed", e);
    return [];
  }
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
  return imported;
}

export async function getAllPrices(): Promise<CachedPrice[]> {
  const db = await getDb();
  return db.getAll(PRICES_STORE_NAME);
}

export async function addTrade(trade: Trade): Promise<number> {
  const db = await getDb();
  const id = await db.add(TRADES_STORE_NAME, trade as Trade);
  return id;
}

// Update existing trade (by id)
export async function updateTrade(trade: Trade): Promise<void> {
  if (trade.id == null) throw new Error("Trade id is required for update");
  const db = await getDb();
  console.log("更新交易:", trade);
  await db.put(TRADES_STORE_NAME, trade);
  console.log("交易更新成功");
}

export async function deleteTrade(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(TRADES_STORE_NAME, id);
}
