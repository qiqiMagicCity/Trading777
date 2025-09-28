import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/trades.json');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set(['buy', 'sell', 'short', 'cover']);

type PersistedTrade = {
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: 'buy' | 'sell' | 'short' | 'cover';
  time: string;
  id?: number;
};

function pad(value: string | number): string {
  return String(value).padStart(2, '0');
}

function normaliseSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function normaliseNumber(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normaliseDate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return DATE_PATTERN.test(trimmed) ? trimmed : '';
}

function normaliseAction(raw: unknown): PersistedTrade['action'] | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  return ACTIONS.has(lower as PersistedTrade['action'])
    ? (lower as PersistedTrade['action'])
    : null;
}

function normaliseTime(date: string, raw: unknown): string | null {
  if (!date) return null;

  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}` +
      `T${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`;
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return normaliseTime(date, new Date(raw));
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return `${date}T00:00:00`;
    }

    if (!trimmed.includes('T')) {
      if (DATE_PATTERN.test(trimmed)) {
        return `${trimmed}T00:00:00`;
      }

      const sanitized = trimmed.replace('Z', '').split('.')[0] ?? '';
      const [h = '00', m = '00', s = '00'] = sanitized.split(':');
      return `${date}T${pad(h)}:${pad(m)}:${pad(s ?? '00')}`;
    }

    const [datePartRaw = '', timePartRaw = ''] = trimmed.split('T');
    const baseDate = DATE_PATTERN.test(datePartRaw) ? datePartRaw : date;
    const sanitized = timePartRaw.replace('Z', '').split('.')[0] ?? '';
    const [h = '00', m = '00', s = '00'] = sanitized.split(':');
    return `${baseDate}T${pad(h)}:${pad(m)}:${pad(s ?? '00')}`;
  }

  return `${date}T00:00:00`;
}

function toPersistedTrade(raw: Record<string, unknown>): PersistedTrade | null {
  const symbol = normaliseSymbol(raw.symbol);
  const price = normaliseNumber(raw.price);
  const quantity = normaliseNumber(
    raw.quantity ?? (raw as Record<string, unknown>).qty,
  );
  const date = normaliseDate(raw.date);
  const action = normaliseAction(raw.action);
  const time = normaliseTime(date, raw.time ?? raw.datetime ?? null);

  if (!symbol || price === null || quantity === null || !date || !action || !time) {
    return null;
  }

  const id = normaliseNumber(raw.id);

  const trade: PersistedTrade = {
    symbol,
    price,
    quantity,
    date,
    action,
    time,
  };

  if (id !== null && Number.isInteger(id)) {
    trade.id = id;
  }

  return trade;
}

function sortTrades(trades: PersistedTrade[]): PersistedTrade[] {
  return trades.slice().sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    const timeDiff = a.time.localeCompare(b.time);
    if (timeDiff !== 0) return timeDiff;
    const idA = a.id ?? Number.MAX_SAFE_INTEGER;
    const idB = b.id ?? Number.MAX_SAFE_INTEGER;
    return idA - idB;
  });
}

export async function PUT(req: NextRequest) {
  try {
    const payload = await req.json();
    const rawTrades: unknown = Array.isArray(payload)
      ? payload
      : (payload as Record<string, unknown>)?.trades;

    if (!Array.isArray(rawTrades)) {
      return new Response(JSON.stringify({ error: 'trades array required' }), {
        status: 400,
      });
    }

    const parsed: PersistedTrade[] = [];
    for (const raw of rawTrades) {
      if (!raw || typeof raw !== 'object') {
        return new Response(JSON.stringify({ error: 'invalid trade payload' }), {
          status: 400,
        });
      }
      const trade = toPersistedTrade(raw as Record<string, unknown>);
      if (!trade) {
        return new Response(JSON.stringify({ error: 'invalid trade payload' }), {
          status: 400,
        });
      }
      parsed.push(trade);
    }

    const sorted = sortTrades(parsed);
    await fs.writeFile(FILE_PATH, JSON.stringify(sorted, null, 2), 'utf8');
    return new Response(JSON.stringify({ ok: true, count: sorted.length }));
  } catch (err) {
    console.error('persist trades error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), {
      status: 500,
    });
  }
}
