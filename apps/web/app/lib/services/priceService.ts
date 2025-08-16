// apps/web/app/lib/services/priceService.ts

import { getPrice, putPrice, CachedPrice } from './dataService';
import { loadJson } from '@/app/lib/dataSource';
import { apiQueue } from './apiQueue';
import { logger } from '@/lib/logger';

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
const freezeDate   = process.env.NEXT_PUBLIC_FREEZE_DATE;

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
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as { price: number; ts: number } | null;
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
        localStorage.setItem(cacheKey, JSON.stringify({ price, ts: Date.now() }));
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
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as { price: number; ts: number } | null;
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
        localStorage.setItem(cacheKey, JSON.stringify({ price, ts: Date.now() }));
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
export interface QuoteResult { price: number; stale: boolean; }

/**
 * 获取“每日收盘价”
 * 顺序：缓存 -> close_prices.json -> 默认值(1)
 * close_prices.json 结构：{ [SYMBOL]: { [YYYY-MM-DD]: price } }
 */
export async function fetchDailyClose(symbol: string, date: string): Promise<QuoteResult> {
  const key = symbol.trim().toUpperCase();

  try {
    // 1) 缓存
    const cachedPrice = await getPrice(key, date);
    if (cachedPrice) {
      saveToFile(key, date, cachedPrice.close);
      return { price: cachedPrice.close, stale: false };
    }

    // 2) 文件
    try {
      const closeMap = await loadJson('close_prices') as Record<string, Record<string, number>>;
      const filePrice = closeMap?.[key]?.[date];
      if (typeof filePrice === 'number') {
        await putPrice({ symbol: key, date, close: filePrice, source: 'import' });
        return { price: filePrice, stale: false };
      }
      console.warn('MISSING_CLOSE', { symbol: key, date, available: closeMap ? Object.keys(closeMap) : [] });
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
    }

    // 3) 兜底：默认值
    return { price: 1, stale: true };
  } catch (error) {
    console.error(`获取 ${key} 在 ${date} 的每日收盘价时出错:`, error);
    return { price: 1, stale: true };
  }
}

/** 实时报价（冻结模式下直接返回冻结日收盘价） */
let _freezeLogged = false;
export async function fetchRealtimeQuote(symbol: string): Promise<QuoteResult> {
  if (freezeDate) {
    if (!_freezeLogged) {
      logger.info('EVAL_FREEZE', { date: freezeDate, source: 'close_prices.json' });
      _freezeLogged = true;
    }
    return fetchDailyClose(symbol, freezeDate);
  }

  try {
    const finnhubPrice = await fetchFinnhubRealtimeQuote(symbol);
    if (finnhubPrice !== null) return { price: finnhubPrice, stale: false };

    const tiingoPrice = await fetchTiingoRealtimeQuote(symbol);
    if (tiingoPrice !== null) return { price: tiingoPrice, stale: false };

    console.warn(`无法获取 ${symbol} 的实时价格，使用默认值 1`);
    return { price: 1, stale: true };
  } catch (error) {
    console.error(`获取 ${symbol} 的实时报价时出错:`, error);
    return { price: 1, stale: true };
  }
}

/** 兼容旧版别名 */
export async function fetchRealtimePrice(symbol: string): Promise<QuoteResult> {
  return fetchRealtimeQuote(symbol);
}
