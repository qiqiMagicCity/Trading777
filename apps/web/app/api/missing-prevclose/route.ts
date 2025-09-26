export const runtime = "nodejs";

import { NextResponse } from 'next/server';
import { getLatestTradingDayStr, nowNY } from '@/lib/timezone';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

type ClosePriceMap = Record<string, Record<string, number>>;

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = existsSync(path.join(PROJECT_ROOT, 'public'))
  ? path.join(PROJECT_ROOT, 'public')
  : path.join(PROJECT_ROOT, 'apps/web/public');
const CLOSE_PRICES_FILE = path.join(PUBLIC_DIR, 'close_prices.json');
const POSITIONS_FILES = [
  path.join(PUBLIC_DIR, 'positions-with-last.json'),
  path.join(PUBLIC_DIR, 'positions.json'),
  path.join(PUBLIC_DIR, 'initial_positions.json'),
];
const TRADES_FILE = path.join(PUBLIC_DIR, 'trades.json');
const WATCHLIST_FILE = path.join(PUBLIC_DIR, 'watchlist.json');

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeSymbol(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

async function readJsonFile(filePath: string): Promise<any | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function ensureSymbolFirst(raw: unknown): ClosePriceMap {
  const map: ClosePriceMap = {};
  if (!raw || typeof raw !== 'object') return map;
  const obj = raw as Record<string, any>;
  const keys = Object.keys(obj);
  const looksLikeDateFirst = keys.length > 0 && keys.every(isDateKey);

  if (looksLikeDateFirst) {
    for (const date of keys) {
      const bySymbol = obj[date];
      if (!bySymbol || typeof bySymbol !== 'object') continue;
      for (const [symbolRaw, priceRaw] of Object.entries(bySymbol)) {
        const symbol = normalizeSymbol(symbolRaw);
        const price = toFiniteNumber(priceRaw);
        if (!symbol || price === undefined) continue;
        (map[symbol] ??= {})[date] = price;
      }
    }
    return map;
  }

  for (const [symbolRaw, byDateRaw] of Object.entries(obj)) {
    const symbol = normalizeSymbol(symbolRaw);
    if (!symbol) continue;
    const byDate = byDateRaw && typeof byDateRaw === 'object' ? byDateRaw : {};
    const store: Record<string, number> = {};
    for (const [date, priceRaw] of Object.entries(byDate as Record<string, unknown>)) {
      if (!isDateKey(date)) continue;
      const price = toFiniteNumber(priceRaw);
      if (price === undefined) continue;
      store[date] = price;
    }
    map[symbol] = store;
  }
  return map;
}

function latestPrice(byDate: Record<string, number> | undefined): number | undefined {
  if (!byDate) return undefined;
  const entries = Object.entries(byDate).filter(([date, price]) => isDateKey(date) && Number.isFinite(price));
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const [, value] = entries[entries.length - 1]!;
  return value;
}

function prevCloseBefore(byDate: Record<string, number> | undefined, today: string): number | undefined {
  if (!byDate) return undefined;
  const entries = Object.entries(byDate)
    .filter(([date, price]) => isDateKey(date) && date < today && Number.isFinite(price))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (entries.length === 0) return undefined;
  const [, value] = entries[entries.length - 1]!;
  return value;
}

async function loadClosePrices(): Promise<ClosePriceMap> {
  const raw = await readJsonFile(CLOSE_PRICES_FILE);
  return ensureSymbolFirst(raw);
}

async function loadPositionFallbacks(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const file of POSITIONS_FILES) {
    const data = await readJsonFile(file);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const symbol = normalizeSymbol((item as Record<string, unknown>).symbol);
      if (!symbol) continue;
      const candidate =
        toFiniteNumber((item as Record<string, unknown>).last) ??
        toFiniteNumber((item as Record<string, unknown>).price) ??
        toFiniteNumber((item as Record<string, unknown>).avgPrice);
      if (candidate === undefined || !Number.isFinite(candidate)) continue;
      if (!map.has(symbol)) map.set(symbol, candidate);
    }
  }
  return map;
}

async function loadTrades(today: string): Promise<{
  symbols: Set<string>;
  lastTradeToday: Map<string, number>;
}> {
  const symbols = new Set<string>();
  const lastTradeToday = new Map<string, number>();
  const data = await readJsonFile(TRADES_FILE);
  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const symbol = normalizeSymbol((item as Record<string, unknown>).symbol);
      if (!symbol) continue;
      symbols.add(symbol);
      const price = toFiniteNumber((item as Record<string, unknown>).price);
      if (price === undefined) continue;
      const dateRaw = (item as Record<string, unknown>).date;
      const date = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : undefined;
      if (date === today) {
        lastTradeToday.set(symbol, price);
      }
    }
  }
  return { symbols, lastTradeToday };
}

async function loadWatchlist(): Promise<string[]> {
  const data = await readJsonFile(WATCHLIST_FILE);
  if (!Array.isArray(data)) return [];
  return data.map((symbol) => normalizeSymbol(symbol)).filter((symbol): symbol is string => Boolean(symbol));
}

export async function GET() {
  try {
    const todayStr = getLatestTradingDayStr(nowNY());
    const closePrices = await loadClosePrices();
    const positionFallbacks = await loadPositionFallbacks();
    const { symbols: tradeSymbols, lastTradeToday } = await loadTrades(todayStr);
    const watchlist = await loadWatchlist();

    const symbols = new Set<string>([
      ...Object.keys(closePrices),
      ...positionFallbacks.keys(),
      ...tradeSymbols,
      ...watchlist,
    ]);

    const missingPrev = new Set<string>();
    const missingMark = new Set<string>();

    for (const symbol of symbols) {
      const byDate = closePrices[symbol];
      const prev = prevCloseBefore(byDate, todayStr);
      const mark =
        toFiniteNumber(byDate?.[todayStr]) ??
        positionFallbacks.get(symbol) ??
        lastTradeToday.get(symbol) ??
        latestPrice(byDate);

      if (prev === undefined) missingPrev.add(symbol);
      if (mark === undefined) missingMark.add(symbol);
    }

    return NextResponse.json({
      todayStr,
      missingPrevClose: Array.from(missingPrev).sort(),
      missingMark: Array.from(missingMark).sort(),
      hint: '缺昨收时，过夜腿按 0 计。你可据此手填或触发快照补齐。',
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'missing_prevclose_failed', message: String(err) },
      { status: 500 },
    );
  }
}
