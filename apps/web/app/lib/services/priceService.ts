// apps/web/app/lib/services/priceService.ts

import {
  resolveTradingDayStr as nyResolveTradingDayStr,
  ymdInNY as nyYmd,
  previousTradingDay as nyPrev,
  isTradingDay as nyIsTradingDay,
  marketBoundaries as nyMarketBoundaries,
} from '../nyDay';
import { getPrice, putPrice, CachedPrice } from './dataService';
import { loadJson } from '@/app/lib/dataSource';
import { apiQueue } from './apiQueue';
import { logger } from '@/lib/logger';
import { safeLocalStorage, lsGet, lsSet } from '../env';
import { NoPriceError } from '../priceService';
import { nyDateStr, toNY, NY_TZ } from '../time';
import { fromZonedTime as zonedTimeToUtc } from 'date-fns-tz';
import { migrateClosePriceMap } from '@/lib/closePriceMigration';
import { evaluateCloseRequirement as evaluateMarketCloseRequirement, resolveCloseGraceMinutes } from '@/lib/marketHours';

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

type QuoteLike = { price: number };
function isQuoteResult(x: unknown): x is QuoteLike {
  return !!x && typeof (x as any).price === 'number';
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

  const tradingDate = nyResolveTradingDayStr(timestamp);
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

export interface SkippedCloseResult {
  skipped: true;
  reason: CloseRequirementDecision['reason'];
}

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

export type CloseRequirementDecision =
  | { require: false; reason: 'invalid-date'; date: null; close: null }
  | { require: false; reason: 'non-trading-day' | 'future-date' | 'pre-close'; date: string; close: Date | null }
  | { require: true; reason: 'post-close'; date: string; close: Date | null };

export async function evaluateCloseRequirement(
  ymd: string,
  nowInput: Date | number = Date.now(),
): Promise<CloseRequirementDecision> {
  const boundaries = nyMarketBoundaries(ymd);
  const normalized = boundaries.ymd;
  const closeTs = boundaries.close.getTime();
  const close = Number.isNaN(closeTs) ? null : new Date(closeTs);

  if (!normalized) {
    return { require: false, reason: 'invalid-date', date: null, close: null };
  }

  if (!nyIsTradingDay(normalized)) {
    return { require: false, reason: 'non-trading-day', date: normalized, close };
  }

  const now = typeof nowInput === 'number' ? toNY(nowInput) : toNY(nowInput);
  const todayStr = nyYmd(now);
  const graceMin = resolveCloseGraceMinutes();
  const graceMs = graceMin > 0 ? graceMin * 60_000 : 0;

  if (normalized < todayStr) {
    return { require: true, reason: 'post-close', date: normalized, close };
  }
  if (normalized > todayStr) {
    return { require: false, reason: 'future-date', date: normalized, close };
  }
  if (close === null) {
    return { require: false, reason: 'non-trading-day', date: normalized, close };
  }

  if (now.getTime() >= close.getTime() + graceMs) {
    return { require: true, reason: 'post-close', date: normalized, close };
  }

  return { require: false, reason: 'pre-close', date: normalized, close };
}

let evaluateCloseRequirementImpl = evaluateCloseRequirement;

export function __setEvaluateCloseRequirementForTest(
  override: ((...args: Parameters<typeof evaluateCloseRequirement>) => Promise<CloseRequirementDecision>) | null,
) {
  evaluateCloseRequirementImpl = override ?? evaluateCloseRequirement;
}

// === 保留 PR 侧：确定下次开盘 & 是否允许收盘后实时价 ===
function nextTradingOpen(date: string): Date {
  if (!parseYmd(date)) return new Date(NaN);
  const base = toNyDateTime(date, 9, 30);
  if (Number.isNaN(base.getTime())) return base;
  const probe = new Date(base.getTime());
  probe.setDate(probe.getDate() + 1);
  let guard = 0;
  while (guard < 64) {
    const candidateYmd = nyYmd(probe);
    if (nyIsTradingDay(candidateYmd)) {
      probe.setHours(9, 30, 0, 0);
      return probe;
    }
    probe.setDate(probe.getDate() + 1);
    guard += 1;
  }
  return new Date(NaN);
}

function shouldUseRealtimeClose(
  targetDate: string,
  nowNY: Date,
  windowMinutes: number,
): boolean {
  const closeMoment = toNyDateTime(targetDate, 16, 0);
  if (Number.isNaN(closeMoment.getTime())) return false;
  const graceMin = resolveCloseGraceMinutes();
  const graceMs = graceMin > 0 ? graceMin * 60_000 : 0;
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
  const anchorDate = date.includes('T') ? nyYmd(new Date(date)) : date;
  if (!parseYmd(anchorDate)) return null;

  let map = closeMap;

  if (!map) {
    try {
      map = await loadJson('close_prices') as Record<string, Record<string, number>>;
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
      map = undefined;
    }
  }

  if (map) {
    map = migrateClosePriceMap(map).map;
  }

  let rolling = anchorDate;

  for (let offset = 1; offset <= maxLookback; offset += 1) {
    rolling = nyPrev(rolling);
    const prevDate = rolling;

    if (!prevDate) {
      break;
    }

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
    for (const [candidateDate, candidatePrice] of Object.entries(symbolMap)) {
      if (typeof candidatePrice !== 'number') continue;
      if (candidateDate >= anchorDate) {
        continue;
      }
      if (!latest || candidateDate > latest.date) {
        latest = { date: candidateDate, price: candidatePrice };
      }
    }
    if (latest) {
      return latest;
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

function isStrictPriceMode(): boolean {
  if (process.env.PRICE_STRICT === '1') return true;
  const mode = process.env.SAFE_PRICE_MODE?.toLowerCase();
  return mode === 'strict';
}

export async function fetchDailyClose(
  symbol: string,
  date: string,
  options: FetchDailyCloseOptions = {},
): Promise<QuoteResult | SkippedCloseResult | null> {
  const key = symbol.trim().toUpperCase();
  const normalizedInput = date.includes('T') ? nyDateStr(date) : date;

  const requirementDecision = await evaluateCloseRequirementImpl(normalizedInput);
  const normalizedDate = requirementDecision.date ?? normalizedInput;

  if (!requirementDecision.require) {
    return { skipped: true, reason: requirementDecision.reason };
  }

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

    if (closeMap) {
      closeMap = migrateClosePriceMap(closeMap).map;
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

    const todayNY = nyYmd(Date.now());
    const latestTradingDate = nyResolveTradingDayStr(Date.now());
    const isToday = normalizedDate === todayNY;
    const isLatestTradingDay = normalizedDate === latestTradingDate;
    const nowNY = toNY(Date.now());
    const requirement = evaluateMarketCloseRequirement(normalizedDate, nowNY);
    const fallbackClose = options?.fallbackClose;
    const fallbackSource = options?.fallbackSource ?? 'close_fallback';

    let dailyPrice: { price: number; source: CachedPrice['source'] } | null = null;

    if (isToday || isLatestTradingDay) {

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
      dailyPrice = await tryDailyApis();
    } else {
      // 历史日，直接请求日线 API
      dailyPrice = await tryDailyApis();
    }

    if (dailyPrice && dailyPrice.price > 0) {
      return await recordOfficialClose(dailyPrice.price, dailyPrice.source);
    }

    if (
      requirement.requireOfficialClose &&
      typeof fallbackClose === 'number' &&
      Number.isFinite(fallbackClose) &&
      fallbackClose > 0
    ) {
      return await recordOfficialClose(fallbackClose, fallbackSource);
    }

    // 日线与实时均失败，做回退
    if (process.env.MONITOR === '1') {
      const available = closeMap ? Object.keys(closeMap) : [];
      console.warn('MISSING_CLOSE', { symbol: key, date: normalizedDate, available });
    }

    const strictMode = isStrictPriceMode();
    const allowFallback = requirementDecision.require && requirementDecision.reason === 'post-close' && !strictMode;

    if (allowFallback) {
      const fallback = await getPrevCloseWithin(key, normalizedDate, MAX_LOOKBACK_DAYS, closeMap);
      if (fallback) {
        if (process.env.MONITOR === '1') {
          console.warn('[priceService] 使用前一收盘价作为回退', {
            symbol: key,
            date: normalizedDate,
            fallbackDate: fallback.date,
            price: fallback.price,
          });
        }
        return { price: fallback.price, stale: true, priceOk: true, updatedAt: Date.now() };
      }
    }

    if (strictMode) {
      throw new NoPriceError(`missing close for ${key} ${normalizedDate}`);
    }

    return null;
  } catch (error) {
    console.error(`获取 ${key} 在 ${normalizedDate} 的每日收盘价时出错:`, error);
    if (isStrictPriceMode()) {
      throw error instanceof NoPriceError ? error : new NoPriceError(`missing close for ${key} ${normalizedDate}`);
    }
    return null;
  }
}

/** 实时报价（冻结模式下直接返回冻结日收盘价） */
let _freezeLogged = false;
export async function fetchRealtimeQuote(symbol: string): Promise<QuoteResult> {
  const freezeRaw = process.env.NEXT_PUBLIC_FREEZE_DATE?.trim();
  const freezeEvalDay = freezeRaw
    ? nyResolveTradingDayStr(undefined, { freeze: freezeRaw })
    : undefined;
  const cachedRealtime = readRealtimeCache(symbol);
  if (freezeRaw && freezeEvalDay) {
    if (!_freezeLogged) {
      logger.info('EVAL_FREEZE', {
        date: freezeEvalDay,
        source: 'close_prices.json',
      });
      _freezeLogged = true;
    }
    try {
      const frozen = await fetchDailyClose(symbol, freezeEvalDay);
      if (isQuoteResult(frozen)) {
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

  const yesterday = nyPrev(nyYmd(Date.now()));
  try {
    const close = await fetchDailyClose(symbol, yesterday);
    if (isQuoteResult(close)) {
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

export const __priceServiceInternals = {
  getPrevCloseWithin,
  isStrictPriceMode,
};

/** 兼容旧版别名 */
export async function fetchRealtimePrice(symbol: string): Promise<QuoteResult> {
  return fetchRealtimeQuote(symbol);
}
