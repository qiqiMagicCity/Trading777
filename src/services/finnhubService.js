import axios from 'axios';
const apiKey = import.meta.env.VITE_FINNHUB_KEY;

/** 获取最新价格 */
export async function fetchPrice(symbol) {
  if (!apiKey) return { price: '--', time: '' };
  const { data } = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
  return { price: data.c || '--', time: new Date(data.t * 1000).toLocaleString() };
}

/** 获取公司名 */
export async function fetchProfile(symbol) {
  if (!apiKey) return { name: symbol };
  const { data } = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`);
  return { name: data.name || symbol };
}
