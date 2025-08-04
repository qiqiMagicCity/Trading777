import { getPrice, putPrice, CachedPrice } from './dataService';
// 所有外部 API 调用都通过 apiQueue 进行排队以防止触发速率限制
import { apiQueue } from './apiQueue';

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



/**
 * 环境变量中的 API 令牌
 */
const finnhubToken = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
const tiingoToken = process.env.NEXT_PUBLIC_TIINGO_TOKEN;
const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;

/**
 * 从文件加载的 API 令牌缓存
 */
interface ApiKeys {
  finnhub?: string;
  tiingo?: string;
}

let _runtimeKeys: ApiKeys | null = null;

/**
 * 从 KEY.txt 文件加载 API 令牌
 * @returns 包含 API 令牌的对象
 */
async function loadKeysFromTxt(): Promise<ApiKeys> {
  if (_runtimeKeys) return _runtimeKeys;

  try {
    const txt = await fetch('/KEY.txt').then(r => r.text());
    const fh = txt.match(/Finnhub\s+key[:：]([A-Za-z0-9]+)/i);
    const tg = txt.match(/Tiingo\s+key[:：]([A-Za-z0-9]+)/i);

    _runtimeKeys = {
      finnhub: fh ? (fh[1] as string).trim() : undefined,
      tiingo: tg ? (tg[1] as string).trim() : undefined,
    };
  } catch (e) {
    console.warn('[priceService] 无法从 KEY.txt 加载 API 密钥', e);
    _runtimeKeys = {};
  }

  return _runtimeKeys;
}

/**
 * 获取 Finnhub API 令牌
 * @returns Finnhub API 令牌
 */
async function getFinnhubToken(): Promise<string | undefined> {
  return finnhubToken || (await loadKeysFromTxt()).finnhub;
}

/**
 * 获取 Tiingo API 令牌
 */
async function getTiingoToken(): Promise<string | undefined> {
  return tiingoToken || (await loadKeysFromTxt()).tiingo;
}

/**
 * Finnhub 每日收盘价响应类型
 */
interface FinnhubCandleResponse {
  c?: number[];
  s?: string;
  error?: string;
}

/**
 * Finnhub 实时报价响应类型
 */
interface FinnhubQuoteResponse {
  c?: number;
  error?: string;
}

/**
 * 从 Finnhub API 获取每日收盘价
 * @param symbol 股票代码
 * @param date 日期，格式为 YYYY-MM-DD
 * @returns 收盘价，如果未找到则返回 null
 */
async function fetchFinnhubDailyClose(symbol: string, date: string): Promise<number | null> {
  const token = await getFinnhubToken();
  if (!token) {
    console.warn('未设置 Finnhub 令牌');
    return null;
  }

  const fromTs = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const toTs = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
  // 通过内部 API 路由转发请求，避免在浏览器暴露密钥
  const url = `/api/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}`;

  try {
    // 使用 apiQueue 队列以避免触发速率限制
    const response = await apiQueue.enqueue(() => fetch(url));
    if (!response.ok) {
      console.warn(`Finnhub API 错误 (${symbol}): ${response.statusText}`);
      return null;
    }

    const json = await response.json() as FinnhubCandleResponse;

    if (json.error) {
      console.warn(`Finnhub API 错误 (${symbol}): ${json.error}`);
      return null;
    }

    if (json && json.c && json.c.length > 0) {
      const close = json.c[0];
      if (typeof close === 'number') {
        await putPrice({ symbol, date, close, source: 'finnhub' });
        return close;
      }
    }
  } catch (error) {
    console.warn(`从 Finnhub 获取数据失败 (${symbol})`, error);
    // 向上抛出错误，便于调用方获知失败原因
    throw error;
  }

  return null;
}


/**
 * 从 Finnhub API 获取实时报价
 * @param symbol 股票代码
 * @returns 实时价格，如果未找到则返回 null
 */
async function fetchFinnhubRealtimeQuote(symbol: string): Promise<number | null> {
  // 请求改为调用内部 API 路由，避免在浏览器暴露密钥
  const url = `/api/quote?symbol=${encodeURIComponent(symbol)}`;

  try {
    // 通过 apiQueue 限制请求速率
    const response = await apiQueue.enqueue(() => fetch(url));
    if (!response.ok) {
      console.warn(`Finnhub 报价 API 错误 (${symbol}): ${response.statusText}`);
      return null;
    }

    const json = await response.json() as FinnhubQuoteResponse;

    if (json.error) {
      console.warn(`Finnhub 报价 API 错误 (${symbol}): ${json.error}`);
      return null;
    }

    // 'c' is current price in Finnhub's quote response
    if (json && typeof json.c === 'number' && json.c > 0) {
      return json.c;
    }
  } catch (error) {
    console.warn(`从 Finnhub 获取报价失败 (${symbol})`, error);
    // 向上抛出错误以便调用方处理
    throw error;
  }

  return null;
}

/**
 * 从 Tiingo API 获取实时报价，并在 localStorage 缓存 5 分钟
 */
async function fetchTiingoRealtimeQuote(symbol: string): Promise<number | null> {
  const token = await getTiingoToken();
  if (!token) {
    console.warn('未设置 Tiingo 令牌');
    return null;
  }

  const cacheKey = `tiingo_rt_${symbol}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as { price: number; ts: number } | null;
    if (cached && Date.now() - cached.ts < 5 * 60_000 && typeof cached.price === 'number') {
      return cached.price;
    }
  } catch {}

  const url = `https://api.tiingo.com/iex/?token=${token}&tickers=${encodeURIComponent(symbol)}`;
  try {
    const resp = await apiQueue.enqueue(() => fetch(url));
    if (!resp.ok) {
      console.warn(`Tiingo 报价 API 错误 (${symbol}): ${resp.statusText}`);
      return null;
    }
    const json = await resp.json() as Array<{ last?: number }>;
    const first = Array.isArray(json) && json.length ? json[0] : undefined;
    if (first && typeof first.last === 'number') {
      const price = first.last;
      try { localStorage.setItem(cacheKey, JSON.stringify({ price, ts: Date.now() })); } catch {}
      return price;
    }
  } catch (err) {
    console.warn(`从 Tiingo 获取报价失败 (${symbol})`, err);
    throw err;
  }
  return null;
}

/**
 * 从 Tiingo API 获取每日收盘价，并在 localStorage 缓存 5 分钟
 */
async function fetchTiingoDailyClose(symbol: string, date: string): Promise<number | null> {
  const token = await getTiingoToken();
  if (!token) {
    console.warn('未设置 Tiingo 令牌');
    return null;
  }

  const cacheKey = `tiingo_close_${symbol}_${date}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as { price: number; ts: number } | null;
    if (cached && Date.now() - cached.ts < 5 * 60_000 && typeof cached.price === 'number') {
      return cached.price;
    }
  } catch {}

  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol)}/prices?token=${token}&startDate=${date}&endDate=${date}`;
  try {
    const resp = await apiQueue.enqueue(() => fetch(url));
    if (!resp.ok) {
      console.warn(`Tiingo 收盘价 API 错误 (${symbol}): ${resp.statusText}`);
      return null;
    }
    const json = await resp.json() as Array<{ close?: number }>;
    const first = Array.isArray(json) && json.length ? json[0] : undefined;
    if (first && typeof first.close === 'number') {
      const price = first.close;
      try { localStorage.setItem(cacheKey, JSON.stringify({ price, ts: Date.now() })); } catch {}
      await putPrice({ symbol, date, close: price, source: 'tiingo' });
      return price;
    }
  } catch (err) {
    console.warn(`从 Tiingo 获取数据失败 (${symbol})`, err);
    throw err;
  }
  return null;
}


/**
 * 获取股票的每日收盘价，使用缓存优先策略
 * 尝试顺序：缓存 -> Finnhub
 * @param symbol 股票代码
 * @param date 日期，格式为 YYYY-MM-DD
 * @returns 收盘价
 * @throws 如果无法从任何来源获取价格，则抛出错误
 */
export interface QuoteResult {
  price: number;
  stale: boolean;
}

export async function fetchDailyClose(symbol: string, date: string): Promise<QuoteResult> {
  try {
    // 首先尝试从缓存获取
    const cachedPrice = await getPrice(symbol, date);
    if (cachedPrice) {
      saveToFile(symbol, date, cachedPrice.close);
      return { price: cachedPrice.close, stale: false };
    }

    // 尝试从 close_prices.json 文件获取
    try {
      const closePrices = await fetch('/close_prices.json').then(r => r.json()) as Record<string, Record<string, number>>;
      const filePrice = closePrices?.[date]?.[symbol];
      if (typeof filePrice === 'number') {
        await putPrice({ symbol, date, close: filePrice, source: 'import' });
        return { price: filePrice, stale: false };
      }
    } catch (err) {
      console.warn('[priceService] 读取 close_prices.json 失败', err);
    }

    // 如果仍未找到价格，提醒用户手动导入并返回默认值
    alert(`缺少 ${symbol} 在 ${date} 的收盘价，请通过“导入收盘价格”功能手动添加。`);
    return { price: 1, stale: true };
  } catch (error) {
    console.error(`获取 ${symbol} 在 ${date} 的每日收盘价时出错:`, error);
    return { price: 1, stale: true };
  }
}

/**
 * 获取股票的实时报价
 * 数据直接来源于 Finnhub
 * @param symbol 股票代码
 * @returns 实时价格
 */
export async function fetchRealtimeQuote(symbol: string): Promise<QuoteResult> {
  // 当设置了冻结日期时，直接返回该日的收盘价
  if (freezeDate) {
    const { price, stale } = await fetchDailyClose(symbol, freezeDate);
    return { price, stale };
  }

  try {
    // 直接从 Finnhub 获取实时报价
    const finnhubPrice = await fetchFinnhubRealtimeQuote(symbol);
    if (finnhubPrice !== null) {
      return { price: finnhubPrice, stale: false };
    }

    // 尝试 Tiingo
    const tiingoPrice = await fetchTiingoRealtimeQuote(symbol);
    if (tiingoPrice !== null) {
      return { price: tiingoPrice, stale: false };
    }

    // 如果所有来源都失败，返回默认值 1
    console.warn(`无法获取 ${symbol} 的实时价格，使用默认值 1`);
    return { price: 1, stale: true };
  } catch (error) {
    console.error(`获取 ${symbol} 的实时报价时出错:`, error);
    return { price: 1, stale: true }; // 错误情况下使用默认值
  }
}

/**
 * 兼容旧版 API：获取股票的实时价格
 * @param symbol 股票代码
 * @returns 实时价格
 */
export async function fetchRealtimePrice(symbol: string): Promise<QuoteResult> {
  return fetchRealtimeQuote(symbol);
}