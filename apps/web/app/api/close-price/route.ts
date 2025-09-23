import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/close_prices.json');

type ClosePriceMap = Record<string, Record<string, number>>;

function toSymbolKey(raw: string): string {
  return raw.trim().toUpperCase();
}

function isDateKey(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function normalize(data: unknown): ClosePriceMap {
  const normalized: ClosePriceMap = {};
  if (!data || typeof data !== 'object') {
    return normalized;
  }

  for (const [outerKey, rawInner] of Object.entries(data as Record<string, unknown>)) {
    if (!rawInner || typeof rawInner !== 'object') {
      continue;
    }

    if (isDateKey(outerKey)) {
      for (const [rawSymbol, rawPrice] of Object.entries(rawInner as Record<string, unknown>)) {
        if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice)) continue;
        const symbolKey = toSymbolKey(rawSymbol);
        (normalized[symbolKey] ??= {})[outerKey] = rawPrice;
      }
      continue;
    }

    const symbolKey = toSymbolKey(outerKey);
    const target = (normalized[symbolKey] ??= {});
    for (const [dateKey, rawPrice] of Object.entries(rawInner as Record<string, unknown>)) {
      if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice)) continue;
      target[dateKey] = rawPrice;
    }
  }

  return normalized;
}

function sortMap(map: ClosePriceMap): ClosePriceMap {
  const sorted: ClosePriceMap = {};
  for (const symbol of Object.keys(map).sort()) {
    const dates = map[symbol];
    sorted[symbol] = {};
    for (const date of Object.keys(dates).sort()) {
      sorted[symbol][date] = dates[date];
    }
  }
  return sorted;
}

export async function POST(req: NextRequest) {
  try {
    const { symbol, date, close } = await req.json();
    if (!symbol || !date || typeof close !== 'number') {
      return new Response(JSON.stringify({ error: 'symbol,date,close required' }), { status: 400 });
    }

    let rawData: unknown = {};
    try {
      const txt = await fs.readFile(FILE_PATH, 'utf8');
      rawData = JSON.parse(txt || '{}');
    }
    // 文件可能不存在或 JSON 无法解析，此处忽略以便初始化为空对象
    // eslint-disable-next-line no-empty
    catch (_err) {
      // intentionally empty
    }

    const data = normalize(rawData);
    const symbolKey = toSymbolKey(symbol);
    (data[symbolKey] ??= {})[date] = close;

    await fs.writeFile(FILE_PATH, JSON.stringify(sortMap(data), null, 2), 'utf8');
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('save close price error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

