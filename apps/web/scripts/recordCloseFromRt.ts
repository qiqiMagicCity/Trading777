#!/usr/bin/env tsx

import fs from 'node:fs/promises';
import { toZonedTime } from 'date-fns-tz';
import { subDays } from 'date-fns';
import { resolvePublicPath } from '../app/lib/server/publicPath';

interface TradeRow {
  symbol?: string;
  action?: string;
  quantity?: number;
}

type ClosePriceMap = Record<string, Record<string, number>>;

type PriceSource = 'quote' | 'fallback';

function normalizeSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase();
}

function computeNetPositions(trades: TradeRow[]): string[] {
  const net = new Map<string, number>();
  for (const row of trades) {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol) continue;
    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const action = String(row.action ?? '').toLowerCase();
    const delta = action === 'sell' ? -qty : qty;
    net.set(symbol, (net.get(symbol) ?? 0) + delta);
  }
  return Array.from(net.entries())
    .filter(([, qty]) => Math.abs(qty) > 1e-9)
    .map(([symbol]) => symbol)
    .sort();
}

function getTargetDate(now = new Date()): string {
  const tz = 'America/New_York';
  let zoned = toZonedTime(now, tz);
  const closingHour = 16;
  const closingMinute = 0;
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const goPrevBusiness = () => {
    zoned = subDays(zoned, 1);
    while (isWeekend(zoned)) {
      zoned = subDays(zoned, 1);
    }
  };

  if (isWeekend(zoned)) {
    goPrevBusiness();
  }
  if (
    zoned.getHours() < closingHour ||
    (zoned.getHours() === closingHour && zoned.getMinutes() < closingMinute)
  ) {
    goPrevBusiness();
  }

  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, '0');
  const d = String(zoned.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    if (!txt.trim()) return fallback;
    return JSON.parse(txt) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[record-close] 读取 ${filePath} 失败`, err);
    }
    return fallback;
  }
}

async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  const joined = symbols.map(encodeURIComponent).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Trading777/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as any;
    const results: any[] = json?.quoteResponse?.result ?? [];
    const priceMap: Record<string, number> = {};
    for (const entry of results) {
      const symbol = normalizeSymbol(entry?.symbol);
      if (!symbol) continue;
      const priceCandidates = [
        entry?.regularMarketPrice,
        entry?.postMarketPrice,
        entry?.preMarketPrice,
        entry?.regularMarketPreviousClose,
        entry?.bid,
        entry?.ask,
      ];
      const price = priceCandidates.find((v: any) => typeof v === 'number' && Number.isFinite(v));
      if (typeof price === 'number') {
        priceMap[symbol] = price;
      }
    }
    return priceMap;
  } catch (err) {
    console.warn('[record-close] 无法从 Yahoo Finance 获取报价，将使用本地兜底。', err);
    return {};
  }
}

function latestPriceFromFile(map: ClosePriceMap, symbol: string): number | null {
  const normalized = normalizeSymbol(symbol);
  const entries = map[normalized];
  if (!entries) return null;
  const dates = Object.keys(entries).sort();
  if (!dates.length) return null;
  const lastDate = dates[dates.length - 1]!;
  const value = entries[lastDate];
  return typeof value === 'number' ? value : null;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortCloseMap(map: ClosePriceMap): ClosePriceMap {
  const sortedSymbols = Object.keys(map).sort();
  const result: ClosePriceMap = {};
  for (const symbol of sortedSymbols) {
    const nested = map[symbol] ?? {};
    const sortedDates = Object.keys(nested).sort();
    const ordered: Record<string, number> = {};
    for (const date of sortedDates) {
      const price = nested[date];
      if (typeof price === 'number') {
        ordered[date] = price;
      }
    }
    result[symbol] = ordered;
  }
  return result;
}

async function main() {
  const tradesPath = resolvePublicPath('trades.json');
  const closePath = resolvePublicPath('close_prices.json');

  const trades = await readJsonFile<TradeRow[]>(tradesPath, []);
  const symbols = computeNetPositions(trades);
  if (!symbols.length) {
    console.log('[record-close] 当前无持仓，跳过更新。');
    return;
  }

  const closeMap = await readJsonFile<ClosePriceMap>(closePath, {});
  const yahooPrices = await fetchYahooQuotes(symbols);
  const targetDate = getTargetDate();

  const updates: { symbol: string; price: number; source: PriceSource }[] = [];

  for (const symbol of symbols) {
    const fromQuote = yahooPrices[symbol];
    let price: number | null = typeof fromQuote === 'number' ? fromQuote : null;
    let source: PriceSource = 'quote';
    if (price === null) {
      const fallback = latestPriceFromFile(closeMap, symbol);
      if (fallback !== null) {
        price = fallback;
        source = 'fallback';
      }
    }
    if (price === null) {
      console.warn(`[record-close] 无法为 ${symbol} 找到价格，跳过。`);
      continue;
    }

    const rounded = roundPrice(price);
    (closeMap[symbol] ??= {})[targetDate] = rounded;
    updates.push({ symbol, price: rounded, source });
  }

  const sorted = sortCloseMap(closeMap);
  await fs.writeFile(closePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

  console.log(`[record-close] 已更新 ${updates.length} 条收盘价（日期：${targetDate}）`);
  for (const row of updates) {
    console.log(` - ${row.symbol}: ${row.price.toFixed(2)} (${row.source})`);
  }
}

main().catch(err => {
  console.error('[record-close] 处理失败', err);
  process.exitCode = 1;
});
