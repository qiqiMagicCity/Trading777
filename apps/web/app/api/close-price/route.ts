import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/close_prices.json');
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

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const body = isRecord(payload) ? payload : {};
    const symbol = normaliseSymbol(body.symbol);
    const date = normaliseDate(body.date);
    const close = normalisePrice(body.close);

    if (!symbol || !date || close === null) {
      return new Response(JSON.stringify({ error: 'symbol,date,close required' }), { status: 400 });
    }

    let data: ClosePriceMap = {};
    try {
      const txt = await fs.readFile(FILE_PATH, 'utf8');
      data = toSymbolFirstMap(JSON.parse(txt || '{}'));
    } catch {
      data = {};
    }

    (data[symbol] ??= {})[date] = close;

    await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('save close price error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

