/**
 * 获取指定股票的实时价格
 * @param symbol 股票代码
 * @returns 实时价格，若获取失败返回 null
 */
export async function fetchRealtimePrice(symbol: string): Promise<number | null> {
  // TODO: 实现实时价格获取逻辑，如 fetch API 调用或其他服务接口
  // 示例：
  // try {
  //   const res = await fetch(`/api/price?symbol=${symbol}`);
  //   if (!res.ok) return null;
  //   const data = await res.json();
  //   return Number(data.price) || null;
  // } catch {
  //   return null;
  // }
  return null;
}

/** 兼容旧代码别名 */
export const fetchRealtimeQuote = fetchRealtimePrice;
