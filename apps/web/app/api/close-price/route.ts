import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { getWritebackMode } from '@/app/lib/prices/writebackConfig';
import {
  getPublicPathCandidates,
  resolvePublicPath,
} from '@/app/lib/server/publicPath';

const CLOSE_PRICE_PATH = resolvePublicPath('close_prices.json');
const CLOSE_PRICE_CANDIDATES = getPublicPathCandidates('close_prices.json');
const DAILY_RESULTS_PATH = resolvePublicPath('dailyResult.json');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ClosePriceMap = Record<string, Record<string, number>>;

function normaliseSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function normaliseDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return DATE_PATTERN.test(trimmed) ? trimmed : '';
}

function normalisePrice(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function toSymbolFirstMap(raw: unknown): ClosePriceMap {
  const result: ClosePriceMap = {};
  if (!raw || typeof raw !== 'object') return result;

  const maybeAdd = (symbol: string, date: string, price: number | null) => {
    if (!symbol || !date || price === null) return;
    (result[symbol] ??= {})[date] = price;
  };

  for (const [outerKey, innerValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!innerValue || typeof innerValue !== 'object') continue;

    if (DATE_PATTERN.test(outerKey)) {
      const date = outerKey;
      for (const [symKey, priceRaw] of Object.entries(innerValue as Record<string, unknown>)) {
        const symbol = normaliseSymbol(symKey);
        maybeAdd(symbol, date, normalisePrice(priceRaw));
      }
    } else {
      const symbol = normaliseSymbol(outerKey);
      const nested = innerValue as Record<string, unknown>;
      for (const [dateKey, priceRaw] of Object.entries(nested)) {
        if (!DATE_PATTERN.test(dateKey)) continue;
        maybeAdd(symbol, dateKey, normalisePrice(priceRaw));
      }
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function mergeSymbolMaps(target: ClosePriceMap, source: ClosePriceMap): ClosePriceMap {
  const output = { ...target };
  for (const [symbol, byDate] of Object.entries(source)) {
    const bucket = output[symbol] ?? (output[symbol] = {});
    for (const [date, price] of Object.entries(byDate)) {
      if (typeof price === 'number' && Number.isFinite(price)) {
        bucket[date] = price;
      }
    }
  }
  return output;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw || 'null') ?? fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get('kind') ?? '').toLowerCase();

  if (kind === 'dailyresults') {
    const payload = await readJson(DAILY_RESULTS_PATH, [] as unknown[]);
    return NextResponse.json(payload);
  }

  const payload = await readJson(CLOSE_PRICE_PATH, {} as Record<string, unknown>);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  if (getWritebackMode() !== 'proxy') {
    return new Response(JSON.stringify({ error: 'writeback disabled' }), { status: 403 });
  }
  try {
    const payload = await req.json();
    if (!isRecord(payload)) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), { status: 400 });
    }

    const kind = typeof payload.kind === 'string' ? payload.kind.toLowerCase() : '';
    if (kind === 'bulk') {
      if (!('data' in payload)) {
        return new Response(JSON.stringify({ error: 'data required' }), { status: 400 });
      }
      const incoming = toSymbolFirstMap(payload.data);
      if (Object.keys(incoming).length === 0) {
        return new Response(JSON.stringify({ error: 'empty payload' }), { status: 400 });
      }
      const existingRaw = await readJson(
        CLOSE_PRICE_PATH,
        {} as Record<string, unknown>,
      );
      const merged = mergeSymbolMaps(toSymbolFirstMap(existingRaw), incoming);
      await fs.writeFile(CLOSE_PRICE_PATH, JSON.stringify(merged, null, 2), 'utf8');
      const entries = Object.values(incoming).reduce(
        (count, byDate) => count + Object.keys(byDate).length,
        0,
      );
      return NextResponse.json({ ok: true, entries });
    }

    const symbol = normaliseSymbol(payload.symbol);
    const date = normaliseDate(payload.date);
    const close = normalisePrice(payload.close);

    if (!symbol || !date || close === null) {
      return new Response(JSON.stringify({ error: 'symbol,date,close required' }), { status: 400 });
    }

    let data: ClosePriceMap = {};
    try {
      const txt = await fs.readFile(CLOSE_PRICE_PATH, 'utf8');
      data = toSymbolFirstMap(JSON.parse(txt || '{}'));
    } catch {
      data = {};
    }

    (data[symbol] ??= {})[date] = close;

    await fs.writeFile(CLOSE_PRICE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('save close price error', err);
    const errorMessage = `failed to write close_prices.json. searched: ${CLOSE_PRICE_CANDIDATES.join(
      ', ',
    )}`;
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
}

