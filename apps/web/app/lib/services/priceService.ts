/**
 * 实时获取股票价格（Finnhub 版）
 * 文档：https://finnhub.io/docs/api#quote
 */

const FINNHUB_KEY =
  // Vite (浏览器代码) 走 import.meta.env
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FINNHUB_KEY) ||
  // Node (SSR / API 路由) 走 process.env
  process.env.VITE_FINNHUB_KEY;

/**
 * 获取指定股票的实时价格
 * @param symbol 股票代码（如 "AAPL"、"TSLA"）
 * @returns 当前价；失败时返回 null
 */
export async function fetchRealtimePrice(symbol: string): Promise<number | null> {
  if (!FINNHUB_KEY) {
    console.warn('⚠️ 未配置 VITE_FINNHUB_KEY，无法获取实时行情');
    return null;
  }

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      symbol
    )}&token=${FINNHUB_KEY}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error('Finnhub 请求失败', res.status);
      return null;
    }

    // Finnhub 返回 { c: 当前价, h: 高, l: 低, o: 开盘, pc: 昨收 }
    const data = (await res.json()) as { c?: number };
    return typeof data.c === 'number' && Number.isFinite(data.c) ? data.c : null;
  } catch (err) {
    console.error('获取实时行情出错', err);
    return null;
  }
}

/** 兼容旧代码别名 */
export const fetchRealtimeQuote = fetchRealtimePrice;
