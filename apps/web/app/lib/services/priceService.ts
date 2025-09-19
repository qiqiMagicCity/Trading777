// apps/web/app/lib/services/priceService.ts

import { getPrice, putPrice, CachedPrice } from './dataService';
import { loadJson } from '@/app/lib/dataSource';
import { apiQueue } from './apiQueue';
import { logger } from '@/lib/logger';
import { isBrowser, safeLocalStorage, lsGet, lsSet } from '../env';
import { NoPriceError } from '../priceService';
import { nyDateStr, startOfDayNY } from '../time';

// Node 降级缓存
const mem = new Map<string, string>();
function cacheGet(key: string): string | null {
  const ls = safeLocalStorage();
  if (!ls) return mem.get(key) ?? null;
  return lsGet(key);
}
function cacheSet(key: string, val: string): void {
  const ls = safeLocalStorage();
  if (!ls) { mem.set(key, val); return; }
  lsSet(key, val);
}

export function __testCacheRW() {
  cacheSet('__test', '1');
  if (cacheGet('__test') !== '1') throw new Error('cache RW failed');
}

// 将收盘价写入服务器端 JSON 文件
async function saveToFile(symbol: string, date: string, close: number) {
  try {
    await fetch('/api/close-price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, date, close }),
    });
  } catch (err) {
    console.warn('[priceService] 保存收盘价失败', err);
  }
}

/** 环境变量中的 API 令牌 & 冻结日 */
const finnhubToken = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
const tiingoToken  = process.env.NEXT_PUBLIC_TIINGO_TOKEN;

/** 从文件加载的 API 令牌缓存 */
interface ApiKeys { finnhub?: string; tiingo?: string; }
let _runtimeKeys: ApiKeys | null = null;

/** 从 KEY.txt 文件加载 API 令牌 */
async function loadKeysFromTxt(): Promise<ApiKeys> {
  if (_runtimeKeys) return _runtimeKeys;

  try {
    const txt = await fetch('/KEY.txt').then(r => r.text());
    const fh = txt.match(/Finnhub\s+key[:：]([A-Za-z0-9]+)/i);
    const tg = txt.match(/Tiingo\s+key[:：]([A-Za-z0-9]+)/i);

    _runtimeKeys = {
      finnhub: fh ? (fh[1] as string).trim() : undefined,
      tiingo:  tg ? (tg[1] as string).trim() : undefined,
    };
  } catch (e) {
    console.warn('[priceService] 无法从 KEY.txt 加载 API 密钥', e);
    _runtimeKeys = {};
  }

  return _runtimeKeys;
}

async function getFinnhubToken(): Promise<string | undefined> {
  return finnhubToken || (await loadKeysFromTxt()).finnhub;
}

async function getTiingoToken(): Promise<string | undefined> {
  return tiingoToken || (await loadKeysFromTxt()).tiingo;
}

/** Finnhub 响应类型 */
interface FinnhubCandleResponse { c?: number[]; s?: string; error?: string; }
interface FinnhubQuoteResponse  { c?: number;   error?: string; }

/** Finnhub: 日线收盘 */
async function fetchFinnhubDailyClose(symbol: string, date: string): Promise<number | null> {
  const token = await getFinnhubToken();
  if (!token) { console.warn('未设置 Finnhub 令牌'); return null; }

  const fromTs = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const toTs   = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
  const url    = `/api/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}`;

  try {
    const response = await apiQueue.enqueue(() => fetch(url));
    if (!response.ok) { console.warn(`Finnhub API 错误 (${symbol}): ${response.statusText}`); return null; }

    const json = await response.json() as FinnhubCandleResponse;
    if (json.error) { console.warn(`Finnhub API 错误 (${symbol}): ${json.error}`); return null; }

    if (json?.c?.length) {
      const close = json.c[0];
      if (typeof close === 'number') {
        await putPrice({ symbol, date, close, source: 'finnhub' });
        return close;
      }
    }
  } catch (error) {
    console.warn(`从 Finnhub 获取数据失败 (${symbol})`, error);
    throw error;
  }
  return null;
}

/** Finnhub: 实时报价 */
async function fetchFinnhubRealtimeQuote(symbol: string): Promise<number | null> {
  const token = await getFinnhubToken();
  if (!token) { console.warn('未设置 Finnhub 令牌'); return null; }

  const url = `/api/quote?symbol=${encodeURIComponent(symbol)}`;
  try {
    const response = await apiQueue.enqueue(() => fetch(url));
    if (!response.ok) { console.warn(`Finnhub 报价 API 错误 (${symbol}): ${response.statusText}`); return null; }
    const json = await response.json() as FinnhubQuoteResponse;
    if (json.error) { console.warn(`Finnhub 报价 API 错误 (${symbol}): ${json.error}`); return null; }
    if (json && typeof json.c === 'number' && json.c > 0) return json.c;
  } catch (error) {
    console.warn(`从 Finnhub 获取报价失败 (${symbol})`, error);
    throw error;
  }
  return null;
}

/** Tiingo: 实时报价（5 分钟本地缓存） */
async function fetchTiingoRealtimeQuote(symbol: string): Promise<number | null> {
  const token = await getTiingoToken();
  if (!token) { console.warn('未设置 Tiingo 令牌'); return null; }

  const cacheKey = `tiingo_rt_${symbol}`;
  try {
    const cached = JSON.parse(cacheGet(cacheKey) || 'null') as { price: number; ts: number } | null;
    if (cached && Date.now() - cached.ts < 5 * 60_000 && typeof cached.price === 'number') {
      return cached.price;
    }
  } catch (_err) {
    // 忽略 localStorage 访问或 JSON 解析错误
  }

  const url = `https://api.tiingo.com/iex/?token=${token}&tickers=${encodeURIComponent(symbol)}`;
  try {
    const resp = await apiQueue.enqueue(() => fetch(url));
    if (!resp.ok) { console.warn(`Tiingo 报价 API 错误 (${symbol}): ${resp.statusText}`); return null; }
    const json = await resp.json() as Array<{ last?: number }>;
    const first = Array.isArray(json) && json.length ? json[0] : undefined;
    if (first && typeof first.last === 'number') {
      const price = first.last;
      try {
        cacheSet(cacheKey, JSON.stringify({ price, ts: Date.now() }));
      } catch (_err) {
        // 忽略写入 localStorage 的错误
      }
      return price;
    }
  } catch (err) {
    console.warn(`从 Tiingo 获取报价失败 (${symbol})`, err);
    throw err;
  }
  return null;
}

/** Tiingo: 日线收盘（5 分钟本地缓存） */
async function fetchTiingoDailyClose(symbol: string, date: string): Promise<number | null> {
  const token = await getTiingoToken();
  if (!token) { console.warn('未设置 Tiingo 令牌'); return null; }

  const cacheKey = `tiingo_close_${symbol}_${date}`;
  try {
    const cached = JSON.parse(cacheGet(cacheKey) || 'null') as { price: number; ts: number } | null;
    if (cached && Date.now() - cached.ts < 5 * 60_000 && typeof cached.price === 'number') {
      return cached.price;
    }
  } catch (_err) {
    // 忽略 localStorage 访问或 JSON 解析错误
  }

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?token=${token}&startDate=${date}&endDate=${date}`;
  try {
    const resp = await apiQueue.enqueue(() => fetch(url));
    if (!resp.ok) { console.warn(`Tiingo 收盘价 API 错误 (${symbol}): ${resp.statusText}`); return null; }
    const json = await resp.json() as Array<{ close?: number }>;
    const first = Array.isArray(json) && json.length ? json[0] : undefined;
    if (first && typeof first.close === 'number') {
      const price = first.close;
      try {
        cacheSet(cacheKey, JSON.stringify({ price, ts: Date.now() }));
      } catch (_err) {
        // 忽略写入 localStorage 的错误
      }
      await putPrice({ symbol, date, close: price, source: 'tiingo' });
      return price;
    }
  } catch (err) {
    console.warn(`从 Tiingo 获取数据失败 (${symbol})`, err);
    throw err;
  }
  return null;
}

/** 统一返回结构 */
export interface QuoteResult {
  price?: number;
  stale?: boolean;
  priceOk?: boolean;
  change?: number | null;
  changePct?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 7;

async function getPrevCloseWithin(
  symbol: string,
  date: string,
  maxLookback = MAX_LOOKBACK_DAYS,
  closeMap?: Record<string, Record<string, number>>
): Promise<{ date: string; price: number } | null> {
  const key = symbol.trim().toUpperCase();
  const anchorInput = date.includes('T') ? date : `${date}T12:00:00Z`;
  const base = startOfDayNY(anchorInput).getTime();
  if (!Number.isFinite(base)) return null;

  let map = closeMap;

  if (!map) {
    try {
      map = await loadJson('close_prices') as Record<string, Record<string, number>>;
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
      map = undefined;
    }
  }

  for (let offset = 1; offset <= maxLookback; offset += 1) {
    const prevDate = nyDateStr(base - offset * DAY_MS);

    try {
      const cached = await getPrice(key, prevDate);
      if (cached && typeof cached.close === 'number') {
        return { date: prevDate, price: cached.close };
      }
    } catch (err) {
      console.warn('[priceService] 读取缓存价格失败', err);
    }

    const filePrice = map?.[key]?.[prevDate];
    if (typeof filePrice === 'number') {
      return { date: prevDate, price: filePrice };
    }
  }

  return null;
}

/**
 * 获取“每日收盘价”
 * 顺序：缓存 -> close_prices.json -> 默认值(1)
 * close_prices.json 结构：{ [SYMBOL]: { [YYYY-MM-DD]: price } }
 */
export async function fetchDailyClose(symbol: string, date: string): Promise<QuoteResult | null> {
  const key = symbol.trim().toUpperCase();

  try {
    const cachedPrice = await getPrice(key, date);
    if (cachedPrice && typeof cachedPrice.close === 'number') {
      saveToFile(key, date, cachedPrice.close);
      return { price: cachedPrice.close, stale: false };
    }

    let closeMap: Record<string, Record<string, number>> | undefined;
    try {
      closeMap = await loadJson('close_prices') as Record<string, Record<string, number>>;
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
    }

    const filePrice = closeMap?.[key]?.[date];
    if (typeof filePrice === 'number') {
      await putPrice({ symbol: key, date, close: filePrice, source: 'import' });
      return { price: filePrice, stale: false };
    }

    if (process.env.MONITOR === '1') {
      const available = closeMap ? Object.keys(closeMap) : [];
      console.warn('MISSING_CLOSE', { symbol: key, date, available });
    }

    const fallback = await getPrevCloseWithin(key, date, MAX_LOOKBACK_DAYS, closeMap);
    if (fallback) {
      if (process.env.MONITOR === '1') {
        console.warn('[priceService] 使用前一收盘价作为回退', { symbol: key, date, fallbackDate: fallback.date, price: fallback.price });
      }
      return { price: fallback.price, stale: true };
    }

    if (process.env.PRICE_STRICT === '1') {
      throw new NoPriceError(`missing close for ${key} ${date}`);
    }

    return null;
  } catch (error) {
    console.error(`获取 ${key} 在 ${date} 的每日收盘价时出错:`, error);
    if (process.env.PRICE_STRICT === '1') {
      throw error instanceof NoPriceError ? error : new NoPriceError(`missing close for ${key} ${date}`);
    }
    return null;
  }
}

/** 实时报价（冻结模式下直接返回冻结日收盘价） */
let _freezeLogged = false;
export async function fetchRealtimeQuote(symbol: string): Promise<QuoteResult> {
  const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;
  if (freezeDate) {
    if (!_freezeLogged) {
      logger.info('EVAL_FREEZE', { date: freezeDate, source: 'close_prices.json' });
      _freezeLogged = true;
    }
    try {
      const frozen = await fetchDailyClose(symbol, freezeDate);
      if (frozen && typeof frozen.price === 'number') {
        return { price: frozen.price, stale: true };
      }
    } catch (err) {
      if (err instanceof NoPriceError) throw err;
      throw new NoPriceError(`no price for ${symbol}`);
    }
    return { priceOk: false, change: null, changePct: null };
  }

  try {
    const finnhubPrice = await fetchFinnhubRealtimeQuote(symbol);
    if (finnhubPrice !== null) return { price: finnhubPrice, stale: false };
  } catch (e) {
    console.warn(`Finnhub 实时报价失败 (${symbol})`, e);
  }

  try {
    const tiingoPrice = await fetchTiingoRealtimeQuote(symbol);
    if (tiingoPrice !== null) return { price: tiingoPrice, stale: false };
  } catch (e) {
    console.warn(`Tiingo 实时报价失败 (${symbol})`, e);
  }

  const yesterday = nyDateStr(Date.now() - DAY_MS);
  try {
    const close = await fetchDailyClose(symbol, yesterday);
    if (close && typeof close.price === 'number') {
      return { price: close.price, stale: true };
    }
  } catch (err) {
    if (err instanceof NoPriceError) throw err;
    console.error(`[priceService] 获取昨日收盘价失败 (${symbol})`, err);
    if (process.env.PRICE_STRICT === '1') {
      throw new NoPriceError(`no price for ${symbol}`);
    }
  }

  return { priceOk: false, change: null, changePct: null };
}

/** 兼容旧版别名 */
export async function fetchRealtimePrice(symbol: string): Promise<QuoteResult> {
  return fetchRealtimeQuote(symbol);
}
