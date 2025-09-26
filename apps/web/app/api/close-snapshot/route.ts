import { NextResponse } from 'next/server';
import { getLatestTradingDayStr, nowNY } from '@/lib/timezone';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

type ClosePriceMap = Record<string, Record<string, number>>;

type PositionSnapshot = { symbol: string; last?: number };

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = existsSync(path.join(PROJECT_ROOT, 'public'))
  ? path.join(PROJECT_ROOT, 'public')
  : path.join(PROJECT_ROOT, 'apps/web/public');
const CLOSE_PRICES_FILE = path.join(PUBLIC_DIR, 'close_prices.json');
const POSITION_CANDIDATES = [
  path.join(PUBLIC_DIR, 'positions-with-last.json'),
  path.join(PUBLIC_DIR, 'positions.json'),
  path.join(PUBLIC_DIR, 'initial_positions.json'),
];
const WATCHLIST_FILE = path.join(PUBLIC_DIR, 'watchlist.json');

const JSON_SPACES = 2;

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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

function normalizeSymbol(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const trimmed = input.trim().toUpperCase();
  return trimmed ? trimmed : undefined;
}

function latestPriceByDate(byDate: Record<string, number> | undefined): number | undefined {
  if (!byDate) return undefined;
  const entries = Object.entries(byDate).filter(([date, price]) => isDateKey(date) && Number.isFinite(price));
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const [, value] = entries[entries.length - 1]!;
  return value;
}

async function loadExistingClosePrices(): Promise<ClosePriceMap> {
  const raw = await readJsonFile(CLOSE_PRICES_FILE);
  return ensureSymbolFirst(raw);
}

async function loadPositionSnapshots(existing: ClosePriceMap): Promise<PositionSnapshot[]> {
  const symbolMap = new Map<string, PositionSnapshot>();

  const upsert = (symbolRaw: unknown, candidate: number | undefined) => {
    const symbol = normalizeSymbol(symbolRaw);
    if (!symbol) return;
    const entry = symbolMap.get(symbol) ?? { symbol };
    if (entry.last === undefined && candidate !== undefined && Number.isFinite(candidate)) {
      entry.last = candidate;
    }
    symbolMap.set(symbol, entry);
  };

  for (const file of POSITION_CANDIDATES) {
    const data = await readJsonFile(file);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const candidate =
        toFiniteNumber((item as Record<string, unknown>).last) ??
        toFiniteNumber((item as Record<string, unknown>).price) ??
        toFiniteNumber((item as Record<string, unknown>).avgPrice);
      upsert((item as Record<string, unknown>).symbol, candidate);
    }
  }

  const watchlist = await readJsonFile(WATCHLIST_FILE);
  if (Array.isArray(watchlist)) {
    for (const symbol of watchlist) {
      upsert(symbol, undefined);
    }
  }

  for (const [symbol, byDate] of Object.entries(existing)) {
    const fallback = latestPriceByDate(byDate);
    const entry = symbolMap.get(symbol);
    if (!entry) {
      symbolMap.set(symbol, { symbol, last: fallback });
    } else if (entry.last === undefined && fallback !== undefined) {
      entry.last = fallback;
    }
  }

  return Array.from(symbolMap.values());
}

export async function POST() {
  try {
    const todayStr = getLatestTradingDayStr(nowNY());
    const closePrices = await loadExistingClosePrices();
    const snapshots = await loadPositionSnapshots(closePrices);

    let written = 0;
    let skipped = 0;

    for (const snap of snapshots) {
      const { symbol, last } = snap;
      if (!symbol || last === undefined || !Number.isFinite(last)) {
        skipped += 1;
        continue;
      }
      (closePrices[symbol] ??= {})[todayStr] = last;
      written += 1;
    }

    await fs.writeFile(CLOSE_PRICES_FILE, JSON.stringify(closePrices, null, JSON_SPACES), 'utf8');

    return NextResponse.json({
      ok: true,
      todayStr,
      written,
      skipped,
      file: path.relative(PROJECT_ROOT, CLOSE_PRICES_FILE) || 'public/close_prices.json',
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'close_snapshot_failed', message: String(err) },
      { status: 500 },
    );
  }
}
