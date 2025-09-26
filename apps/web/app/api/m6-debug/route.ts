export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  getM6DebugBreakdown,
  calcHistoryFifoPnL,
  calcTodayFifoPnL,
} from "@/app/lib/metrics";
import { readPublicJson } from "@/app/lib/io/readPublicJson";
import sortTrades from "@/app/lib/sortTrades";
import { getLatestTradingDayStr, nowNY } from "@/lib/timezone";
import { computeFifo, type InitialPosition, type EnrichedTrade } from "@/lib/fifo";
import type { Trade, Position } from "@/lib/services/dataService";

type ClosePriceMap = Record<string, Record<string, number>>;

const POSITION_FILES = [
  "positions-with-last.json",
  "positions.json",
  "initial_positions.json",
];

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

function normalizeAction(value: unknown): Trade["action"] | undefined {
  if (typeof value !== "string") return undefined;
  const key = value
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z_]/gi, "")
    .toUpperCase();
  return ACTION_ALIASES[key];
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function ensureSymbol(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : undefined;
}

function ensureSymbolFirst(raw: unknown): ClosePriceMap {
  const map: ClosePriceMap = {};
  if (!raw || typeof raw !== "object") return map;
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  const looksDateFirst = keys.length > 0 && keys.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (looksDateFirst) {
    for (const date of keys) {
      const bySymbol = obj[date];
      if (!bySymbol || typeof bySymbol !== "object") continue;
      for (const [symRaw, priceRaw] of Object.entries(bySymbol as Record<string, unknown>)) {
        const symbol = ensureSymbol(symRaw);
        const price = toFiniteNumber(priceRaw);
        if (!symbol || price === undefined) continue;
        (map[symbol] ??= {})[date] = price;
      }
    }
    return map;
  }
  for (const [symRaw, byDateRaw] of Object.entries(obj)) {
    const symbol = ensureSymbol(symRaw);
    if (!symbol) continue;
    const store: Record<string, number> = {};
    if (byDateRaw && typeof byDateRaw === "object") {
      for (const [date, priceRaw] of Object.entries(byDateRaw as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        const price = toFiniteNumber(priceRaw);
        if (price === undefined) continue;
        store[date] = price;
      }
    }
    map[symbol] = store;
  }
  return map;
}

function latestPrice(byDate: Record<string, number> | undefined): number | undefined {
  if (!byDate) return undefined;
  const entries = Object.entries(byDate).filter(
    ([date, price]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(price),
  );
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return entries[entries.length - 1]![1];
}

function prevCloseBefore(
  byDate: Record<string, number> | undefined,
  today: string,
): number | undefined {
  if (!byDate) return undefined;
  const entries = Object.entries(byDate)
    .filter(([date, price]) => date < today && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(price))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (entries.length === 0) return undefined;
  return entries[entries.length - 1]![1];
}

function isoDate(value: unknown): string | null {
  if (typeof value === "string" && value.length >= 10) return value.slice(0, 10);
  const ts = new Date(value as any);
  if (!Number.isFinite(ts.getTime())) return null;
  return ts.toISOString().slice(0, 10);
}

function normalizeTrade(raw: any): Trade | null {
  const symbol = ensureSymbol(raw?.symbol);
  if (!symbol) return null;
  const action = normalizeAction(raw?.side ?? raw?.action);
  if (!action) return null;
  const qty = toFiniteNumber(raw?.qty ?? raw?.quantity);
  if (qty === undefined || qty === 0) return null;
  const price = toFiniteNumber(raw?.price);
  if (price === undefined || price <= 0) return null;
  const quantity = action === "short" ? -Math.abs(qty) : Math.abs(qty);
  const date = typeof raw?.date === "string" ? raw.date : isoDate(raw?.time) ?? new Date().toISOString();
  const trade: Trade = {
    symbol,
    price,
    quantity,
    action,
    date: date ?? new Date().toISOString(),
  };
  if (raw?.time !== undefined) {
    trade.time = raw.time as Trade["time"];
  } else if (raw?.datetime !== undefined) {
    trade.time = raw.datetime as Trade["time"];
  }
  if (raw?.isInitialPosition === true) {
    trade.isInitialPosition = true;
  }
  return trade;
}

function normalizeInitialPosition(raw: any): InitialPosition | null {
  const symbol = ensureSymbol(raw?.symbol);
  if (!symbol) return null;
  const qty = toFiniteNumber(raw?.qty);
  const avgPrice = toFiniteNumber(raw?.avgPrice);
  if (qty === undefined || avgPrice === undefined) return null;
  return { symbol, qty, avgPrice };
}

function determineTradingDate(
  defaultDate: string,
  trades: EnrichedTrade[],
  prices: ClosePriceMap,
): string {
  const tradeDays = trades
    .map((trade) => isoDate(trade?.date ?? trade?.time))
    .filter((d): d is string => Boolean(d));
  if (tradeDays.includes(defaultDate)) return defaultDate;
  const latestTradeDay = tradeDays.length
    ? tradeDays.reduce((max, day) => (day > max ? day : max), tradeDays[0] as string)
    : null;
  if (latestTradeDay) return latestTradeDay;
  const priceDays: string[] = [];
  for (const byDate of Object.values(prices)) {
    for (const date of Object.keys(byDate)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) priceDays.push(date);
    }
  }
  if (priceDays.length === 0) return defaultDate;
  return priceDays.reduce((max, day) => (day > max ? day : max), priceDays[0]!);
}

async function loadTrades(): Promise<Trade[]> {
  const raw = await readPublicJson<any[]>("trades.json", []);
  return raw.map(normalizeTrade).filter((t): t is Trade => Boolean(t));
}

async function loadInitialPositions(): Promise<InitialPosition[]> {
  const raw = await readPublicJson<any[]>("initial_positions.json", []);
  return raw
    .map(normalizeInitialPosition)
    .filter((p): p is InitialPosition => Boolean(p));
}

async function loadClosePrices(): Promise<ClosePriceMap> {
  const raw = await readPublicJson<any>("close_prices.json", {});
  return ensureSymbolFirst(raw);
}

async function loadPositions(
  today: string,
  prices: ClosePriceMap,
): Promise<Position[]> {
  const map = new Map<string, Position>();

  for (const file of POSITION_FILES) {
    const rawList = await readPublicJson<any[]>(file, []);
    for (const item of rawList) {
      const symbol = ensureSymbol(item?.symbol);
      if (!symbol) continue;
      const qty = toFiniteNumber(item?.qty);
      const avgPrice = toFiniteNumber(item?.avgPrice ?? item?.price);
      if (qty === undefined || avgPrice === undefined) continue;
      const lastCandidate =
        toFiniteNumber(item?.last) ??
        toFiniteNumber(item?.price) ??
        toFiniteNumber(item?.avgPrice);
      const prevCandidate =
        toFiniteNumber(item?.prevClose) ?? toFiniteNumber(item?.previousClose);

      const existing = map.get(symbol);
      const entry: Position = existing ?? {
        symbol,
        qty,
        avgPrice,
        last: Number.isFinite(lastCandidate ?? NaN)
          ? (lastCandidate as number)
          : Number.NaN,
        priceOk: false,
      };
      entry.qty = qty;
      entry.avgPrice = avgPrice;
      if (Number.isFinite(lastCandidate)) entry.last = lastCandidate as number;
      if (Number.isFinite(prevCandidate)) entry.prevClose = prevCandidate as number;
      map.set(symbol, entry);
    }
  }

  for (const [symbol, entry] of map.entries()) {
    const byDate = prices[symbol];
    const mark =
      Number.isFinite(entry.last) ? entry.last :
      toFiniteNumber(byDate?.[today]) ?? latestPrice(byDate);
    if (Number.isFinite(mark)) {
      entry.last = mark as number;
      entry.priceOk = true;
    } else {
      entry.priceOk = false;
    }
    const prev = entry.prevClose ?? prevCloseBefore(byDate, today);
    if (Number.isFinite(prev)) entry.prevClose = prev as number;
  }

  return Array.from(map.values());
}

export async function GET() {
  try {
    const [tradesRaw, initialPositions, closePrices] = await Promise.all([
      loadTrades(),
      loadInitialPositions(),
      loadClosePrices(),
    ]);

    const enriched = computeFifo(tradesRaw, initialPositions);
    const defaultToday = getLatestTradingDayStr(nowNY());
    const tradingDateStr = determineTradingDate(defaultToday, enriched, closePrices);

    const positions = await loadPositions(tradingDateStr, closePrices);

    const sortedTrades = sortTrades(enriched);
    const M4 = calcHistoryFifoPnL(sortedTrades, tradingDateStr);
    const M5_2 = calcTodayFifoPnL(sortedTrades, tradingDateStr);

    const todayTrades = sortedTrades.filter(
      (trade) => isoDate(trade?.date ?? trade?.time) === tradingDateStr,
    );

    const breakdown = getM6DebugBreakdown({
      positions,
      todayTrades,
      M4: M4 ?? 0,
      M5_2: M5_2 ?? 0,
    });

    return NextResponse.json({
      tradingDateStr,
      totals: breakdown.totals,
      warnings: breakdown.warnings,
      perSymbol: breakdown.perSymbol,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "m6_debug_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
