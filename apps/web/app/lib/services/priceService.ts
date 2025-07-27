import { getPrice, putPrice, CachedPrice } from './dataService';
// 所有外部 API 调用都通过 apiQueue 进行排队以防止触发速率限制
import { apiQueue } from './apiQueue';

/**
 * API 基础 URL 常量
 */
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * 环境变量中的 API 令牌
 */
const finnhubToken = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;

/**
 * 从文件加载的 API 令牌缓存
 */
interface ApiKeys {
  finnhub?: string;
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
    const fh = txt.match(/Finnhub\s+key：([A-Za-z0-9]+)/i);

    _runtimeKeys = {
      finnhub: fh ? (fh[1] as string).trim() : undefined,
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
  const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}&token=${token}`;

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
  const token = await getFinnhubToken();
  if (!token) {
    console.warn('未设置 Finnhub 令牌');
    return null;
  }

  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;

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
 * 获取股票的每日收盘价，使用缓存优先策略
 * 尝试顺序：缓存 -> Finnhub
 * @param symbol 股票代码
 * @param date 日期，格式为 YYYY-MM-DD
 * @returns 收盘价
 * @throws 如果无法从任何来源获取价格，则抛出错误
 */
export async function fetchDailyClose(symbol: string, date: string): Promise<number> {
  try {
    // 首先尝试从缓存获取
    const cachedPrice = await getPrice(symbol, date);
    if (cachedPrice) {
      return cachedPrice.close;
    }

    // 然后尝试从 Finnhub 获取
    const finnhubPrice = await fetchFinnhubDailyClose(symbol, date);
    if (finnhubPrice !== null) {
      return finnhubPrice;
    }

    // 如果所有来源都失败，返回默认值 1 而不是抛出错误
    console.warn(`无法获取 ${symbol} 在 ${date} 的收盘价，使用默认值 1`);
    return 1;
  } catch (error) {
    console.error(`获取 ${symbol} 在 ${date} 的每日收盘价时出错:`, error);
    return 1; // 错误情况下使用默认值
  }
}

/**
 * 获取股票的实时报价
 * 数据直接来源于 Finnhub
 * @param symbol 股票代码
 * @returns 实时价格
 */
export async function fetchRealtimeQuote(symbol: string): Promise<number> {
  try {
    // 直接从 Finnhub 获取实时报价
    const finnhubPrice = await fetchFinnhubRealtimeQuote(symbol);
    if (finnhubPrice !== null) {
      return finnhubPrice;
    }

    // 如果所有来源都失败，返回默认值 1
    console.warn(`无法获取 ${symbol} 的实时价格，使用默认值 1`);
    return 1;
  } catch (error) {
    console.error(`获取 ${symbol} 的实时报价时出错:`, error);
    return 1; // 错误情况下使用默认值
  }
}

/**
 * 兼容旧版 API：获取股票的实时价格
 * @param symbol 股票代码
 * @returns 实时价格
 */
export async function fetchRealtimePrice(symbol: string): Promise<number> {
  return fetchRealtimeQuote(symbol);
} 