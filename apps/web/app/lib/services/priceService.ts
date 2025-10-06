// apps/web/app/lib/services/priceService.ts

import { getPrice, putPrice, CachedPrice } from './dataService';
import { loadJson } from '@/app/lib/dataSource';
import { apiQueue } from './apiQueue';
import { logger } from '@/lib/logger';
import { safeLocalStorage, lsGet, lsSet } from '../env';
import { NoPriceError } from '../priceService';
import { nyDateStr, toNY, NY_TZ } from '../time';
import { getTradingDateStr } from '../tradingDay';
import { fromZonedTime as zonedTimeToUtc } from 'date-fns-tz';

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

export function __clearPriceServiceCachesForTest() {
  mem.clear();
  _runtimeKeys = null;
}

export function __setRuntimeApiKeysForTest(keys: ApiKeys | null) {
  _runtimeKeys = keys;
}

interface RealtimeCacheEntry {
  price: number;
  ts: number;
}

function rtCacheKey(symbol: string): string {
  return `rt_last_${symbol.trim().toUpperCase()}`;
}

function readRealtimeCache(symbol: string): RealtimeCacheEntry | null {
  try {
    const raw = cacheGet(rtCacheKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RealtimeCacheEntry> | null;
    if (!parsed || typeof parsed.price !== 'number' || !Number.isFinite(parsed.price)) {
      return null;
    }
    const ts = typeof parsed.ts === 'number' && Number.isFinite(parsed.ts) ? parsed.ts : 0;
    return { price: parsed.price, ts };
  } catch (err) {
    console.warn('[priceService] 读取实时价格缓存失败', err);
    return null;
  }
}

function writeRealtimeCache(symbol: string, price: number): RealtimeCacheEntry {
  const entry: RealtimeCacheEntry = { price, ts: Date.now() };
  try {
    cacheSet(rtCacheKey(symbol), JSON.stringify(entry));
  } catch (err) {
    console.warn('[priceService] 写入实时价格缓存失败', err);
  }
  return entry;
}

async function persistRealtimeClose(
  symbol: string,
  price: number,
  timestamp: number,
): Promise<void> {
  if (!(typeof price === 'number' && Number.isFinite(price) && price > 0)) return;

  const key = symbol.trim().toUpperCase();
  if (!key) return;

  const tradingDate = getTradingDateStr(timestamp);
  const nowNY = toNY(timestamp);
  const windowMinutes = resolveRtCloseWindow();
  if (!shouldUseRealtimeClose(tradingDate, nowNY, windowMinutes)) return;

  const closeMoment = toNyDateTime(tradingDate, 16, 0);
  if (Number.isNaN(closeMoment.getTime())) return;
  if (nowNY.getTime() < closeMoment.getTime()) return;

  try {
    await putPrice({ symbol: key, date: tradingDate, close: price, source: 'close_rt' });
  } catch (err) {
    console.warn('[priceService] 缓存收盘价失败', err);
  }

  await saveToFile(key, tradingDate, price);
}

export function getCachedRealtimeQuote(symbol: string): QuoteResult | null {
  const cached = readRealtimeCache(symbol);
  if (!cached) return null;
  return {
    price: cached.price,
    stale: true,
    priceOk: true,
    updatedAt: cached.ts,
  };
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
  } catch {
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
      } catch {
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
  } catch {
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
      } catch {
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
  updatedAt?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_RT_CLOSE_WINDOW_MIN = 180;

// === 保留 PR 侧：日期工具与窗口解析 ===
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const match = DATE_ONLY_RE.exec(date);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { y: year, m: month, d: day };
}

function toNyDateTime(date: string, hour: number, minute: number): Date {
  if (!parseYmd(date)) return new Date(NaN);
  const iso = `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const utc = zonedTimeToUtc(iso, NY_TZ);
  return toNY(utc);
}

function resolveRtCloseWindow(): number {
  const raw = process.env.RT_CLOSE_WINDOW_MIN;
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_RT_CLOSE_WINDOW_MIN;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_RT_CLOSE_WINDOW_MIN;
  if (parsed < 0) return DEFAULT_RT_CLOSE_WINDOW_MIN;
  return parsed;
}

// === 保留 PR 侧：确定下次开盘 & 是否允许收盘后实时价 ===
function nextTradingOpen(date: string): Date {
  if (!parseYmd(date)) return new Date(NaN);
  const base = toNyDateTime(date, 9, 30);
  if (Number.isNaN(base.getTime())) return base;
  const next = new Date(base.getTime());
  next.setDate(next.getDate() + 1);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(9, 30, 0, 0);
  return next;
}

function shouldUseRealtimeClose(
  targetDate: string,
  nowNY: Date,
  windowMinutes: number,
): boolean {
  const closeMoment = toNyDateTime(targetDate, 16, 0);
  if (Number.isNaN(closeMoment.getTime())) return false;
  const graceRaw = Number(process.env.CLOSE_GRACE_MIN ?? '0');
  const graceMs = Number.isFinite(graceRaw) && graceRaw > 0 ? graceRaw * 60_000 : 0;
  if (nowNY.getTime() < closeMoment.getTime() + graceMs) return false;
  const diffMin = (nowNY.getTime() - closeMoment.getTime()) / 60_000;
  if (windowMinutes > 0 && diffMin <= windowMinutes) return true;
  const nextOpen = nextTradingOpen(targetDate);
  if (Number.isNaN(nextOpen.getTime())) return false;
  return nowNY.getTime() < nextOpen.getTime();
}

async function getPrevCloseWithin(
  symbol: string,
  date: string,
  maxLookback = MAX_LOOKBACK_DAYS,
  closeMap?: Record<string, Record<string, number>>
): Promise<{ date: string; price: number } | null> {
  const key = symbol.trim().toUpperCase();
  const anchorDate = date.includes('T') ? nyDateStr(date) : date;
  const base = new Date(`${anchorDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(base)) return null;
  const middayOffset = 12 * 60 * 60 * 1000;

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
    const prevDate = nyDateStr(base + middayOffset - offset * DAY_MS);

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

  const symbolMap = map?.[key];
  if (symbolMap && typeof symbolMap === 'object') {
    let latest: { date: string; price: number } | null = null;
    let earliestFuture: { date: string; price: number } | null = null;
    for (const [candidateDate, candidatePrice] of Object.entries(symbolMap)) {
      if (typeof candidatePrice !== 'number') continue;
      if (candidateDate >= anchorDate) {
        if (candidateDate > anchorDate) {
          if (
            !earliestFuture ||
            new Date(candidateDate).getTime() < new Date(earliestFuture.date).getTime()
          ) {
            earliestFuture = { date: candidateDate, price: candidatePrice };
          }
        }
        continue;
      }
      if (!latest || candidateDate > latest.date) {
        latest = { date: candidateDate, price: candidatePrice };
      }
    }
    if (latest) {
      return latest;
    }
    if (earliestFuture) {
      return earliestFuture;
    }
  }

  return null;
}

/**
 * 获取“每日收盘价”
 * 顺序：缓存 -> close_prices.json -> 默认值(1)
 * close_prices.json 结构：{ [SYMBOL]: { [YYYY-MM-DD]: price } }
 */
interface FetchDailyCloseOptions {
  /**
   * 当实时接口不可用但仍处于“收盘至下一次开盘”窗口时，可以传入一个备用收盘价（例如前台实时价），
   * 让函数在确认窗口有效后依旧将该价格视为官方收盘价并落盘，避免周末/节假日缺口。
   */
  fallbackClose?: number | null;
  /** 自定义数据来源标签，默认为 close_fallback */
  fallbackSource?: CachedPrice['source'];
}

export async function fetchDailyClose(
  symbol: string,
  date: string,
  options: FetchDailyCloseOptions = {},
): Promise<QuoteResult | null> {
  const key = symbol.trim().toUpperCase();
  const normalizedDate = date.includes('T') ? nyDateStr(date) : date;

  try {
    const cachedPrice = await getPrice(key, normalizedDate);
    if (cachedPrice && typeof cachedPrice.close === 'number') {
      await saveToFile(key, normalizedDate, cachedPrice.close);
      return { price: cachedPrice.close, stale: false, priceOk: true, updatedAt: Date.now() };
    }

    let closeMap: Record<string, Record<string, number>> | undefined;
    try {
      closeMap = await loadJson('close_prices') as Record<string, Record<string, number>>;
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
    }

    const filePrice = closeMap?.[key]?.[normalizedDate];
    if (typeof filePrice === 'number') {
      await putPrice({ symbol: key, date: normalizedDate, close: filePrice, source: 'import' });
      await saveToFile(key, normalizedDate, filePrice);
      return { price: filePrice, stale: false, priceOk: true, updatedAt: Date.now() };
    }

    const tryDailyApis = async (): Promise<{ price: number; source: CachedPrice['source'] } | null> => {
      try {
        const fh = await fetchFinnhubDailyClose(key, normalizedDate);
        if (typeof fh === 'number') return { price: fh, source: 'finnhub' };
      } catch (err) {
        console.warn('[priceService] Finnhub 日线接口失败', err);
      }
      try {
        const ti = await fetchTiingoDailyClose(key, normalizedDate);
        if (typeof ti === 'number') return { price: ti, source: 'tiingo' };
      } catch (err) {
        console.warn('[priceService] Tiingo 日线接口失败', err);
      }
      return null;
    };

    const recordOfficialClose = async (
      price: number,
      source: CachedPrice['source'] = 'import'
    ) => {
      await putPrice({ symbol: key, date: normalizedDate, close: price, source });
      await saveToFile(key, normalizedDate, price);
      return { price, stale: false, priceOk: true, updatedAt: Date.now() } as QuoteResult;
    };

    const todayNY = nyDateStr(Date.now());
    const latestTradingDate = getTradingDateStr(Date.now());
    const isToday = normalizedDate === todayNY;
    const isLatestTradingDay = normalizedDate === latestTradingDate;

    if (isToday || isLatestTradingDay) {
      const nowNY = toNY(Date.now());

      // === 保留 PR 侧：使用扩展窗口/次日开盘前窗口 ===
      const windowMinutes = resolveRtCloseWindow();
      const allowRealtime = (() => {
        if (!isLatestTradingDay && !isToday) return false;
        return shouldUseRealtimeClose(normalizedDate, nowNY, windowMinutes);
      })();

      if (allowRealtime) {
        // 1) 先用缓存的实时价（若时间戳晚于当日 16:00）
        const cachedRealtime = readRealtimeCache(key);
        if (cachedRealtime && typeof cachedRealtime.price === 'number' && cachedRealtime.price > 0) {
          const closeMoment = toNyDateTime(normalizedDate, 16, 0);
          const cachedMoment = toNY(cachedRealtime.ts);
          if (
            Number.isFinite(closeMoment.getTime()) &&
            Number.isFinite(cachedMoment.getTime()) &&
            cachedMoment.getTime() >= closeMoment.getTime()
          ) {
            return await recordOfficialClose(cachedRealtime.price, 'close_rt');
          }
        }

        // 2) 其后再尝试实时接口
        try {
          const rt =
            (await fetchFinnhubRealtimeQuote(key)) ??
            (await fetchTiingoRealtimeQuote(key));
          if (typeof rt === 'number' && rt > 0) {
            return await recordOfficialClose(rt, 'close_rt');
          }
        } catch {
          // 获取不到就继续走后备逻辑
        }
      }

      // 3) 仍在收盘后窗口，接受调用方 fallback 作为官方收盘价
      const fallbackClose = options?.fallbackClose;
      const afterOfficialClose = (() => {
        const closeMoment = toNyDateTime(normalizedDate, 16, 0);
        return !Number.isNaN(closeMoment.getTime()) && nowNY.getTime() >= closeMoment.getTime();
      })();

      if (
        afterOfficialClose &&
        isLatestTradingDay &&
        typeof fallbackClose === 'number' &&
        Number.isFinite(fallbackClose) &&
        fallbackClose > 0
      ) {
        return await recordOfficialClose(
          fallbackClose,
          options.fallbackSource ?? 'close_fallback',
        );
      }

      // 4) 最后再尝试日线 API
      const dailyPrice = await tryDailyApis();
      if (dailyPrice && dailyPrice.price > 0) {
        return await recordOfficialClose(dailyPrice.price, dailyPrice.source);
      }
    } else {
      // 历史日，直接请求日线 API
      const historicalDaily = await tryDailyApis();
      if (historicalDaily && historicalDaily.price > 0) {
        return await recordOfficialClose(historicalDaily.price, historicalDaily.source);
      }
    }

    // 日线与实时均失败，做回退
    if (process.env.MONITOR === '1') {
      const available = closeMap ? Object.keys(closeMap) : [];
      console.warn('MISSING_CLOSE', { symbol: key, date: normalizedDate, available });
    }

    const fallback = await getPrevCloseWithin(key, normalizedDate, MAX_LOOKBACK_DAYS, closeMap);
    if (fallback) {
      if (process.env.MONITOR === '1') {
        const isFutureFallback = fallback.date >= normalizedDate;
        const tag = isFutureFallback ? '[priceService] 使用未来收盘价作为回退' : '[priceService] 使用前一收盘价作为回退';
        console.warn(tag, { symbol: key, date: normalizedDate, fallbackDate: fallback.date, price: fallback.price });
      }
      return { price: fallback.price, stale: true, priceOk: true, updatedAt: Date.now() };
    }

    if (process.env.PRICE_STRICT === '1') {
      throw new NoPriceError(`missing close for ${key} ${normalizedDate}`);
    }

    return null;
  } catch (error) {
    console.error(`获取 ${key} 在 ${normalizedDate} 的每日收盘价时出错:`, error);
    if (process.env.PRICE_STRICT === '1') {
      throw error instanceof NoPriceError ? error : new NoPriceError(`missing close for ${key} ${normalizedDate}`);
    }
    return null;
  }
}

/** 实时报价（冻结模式下直接返回冻结日收盘价） */
let _freezeLogged = false;
export async function fetchRealtimeQuote(symbol: string): Promise<QuoteResult> {
  const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;
  const cachedRealtime = readRealtimeCache(symbol);
  if (freezeDate) {
    if (!_freezeLogged) {
      logger.info('EVAL_FREEZE', { date: freezeDate, source: 'close_prices.json' });
      _freezeLogged = true;
    }
    try {
      const frozen = await fetchDailyClose(symbol, freezeDate);
      if (frozen && typeof frozen.price === 'number') {
        const entry = writeRealtimeCache(symbol, frozen.price);
        return { price: frozen.price, stale: true, priceOk: true, updatedAt: entry.ts };
      }
    } catch (err) {
      if (err instanceof NoPriceError) throw err;
      throw new NoPriceError(`no price for ${symbol}`);
    }
    return { priceOk: false, change: null, changePct: null };
  }

  try {
    const finnhubPrice = await fetchFinnhubRealtimeQuote(symbol);
    if (finnhubPrice !== null) {
      const entry = writeRealtimeCache(symbol, finnhubPrice);
      void persistRealtimeClose(symbol, finnhubPrice, entry.ts);
      return { price: finnhubPrice, stale: false, priceOk: true, updatedAt: entry.ts };
    }
  } catch (e) {
    console.warn(`Finnhub 实时报价失败 (${symbol})`, e);
  }

  try {
    const tiingoPrice = await fetchTiingoRealtimeQuote(symbol);
    if (tiingoPrice !== null) {
      const entry = writeRealtimeCache(symbol, tiingoPrice);
      void persistRealtimeClose(symbol, tiingoPrice, entry.ts);
      return { price: tiingoPrice, stale: false, priceOk: true, updatedAt: entry.ts };
    }
  } catch (e) {
    console.warn(`Tiingo 实时报价失败 (${symbol})`, e);
  }

  const yesterday = nyDateStr(Date.now() - DAY_MS);
  try {
    const close = await fetchDailyClose(symbol, yesterday);
    if (close && typeof close.price === 'number') {
      const entry = writeRealtimeCache(symbol, close.price);
      return { price: close.price, stale: true, priceOk: true, updatedAt: entry.ts };
    }
  } catch (err) {
    if (err instanceof NoPriceError) throw err;
    console.error(`[priceService] 获取昨日收盘价失败 (${symbol})`, err);
    if (process.env.PRICE_STRICT === '1') {
      throw new NoPriceError(`no price for ${symbol}`);
    }
  }

  if (cachedRealtime) {
    return { price: cachedRealtime.price, stale: true, priceOk: true, updatedAt: cachedRealtime.ts };
  }

  return { priceOk: false, change: null, changePct: null };
}

/** 兼容旧版别名 */
export async function fetchRealtimePrice(symbol: string): Promise<QuoteResult> {
  return fetchRealtimeQuote(symbol);
}
