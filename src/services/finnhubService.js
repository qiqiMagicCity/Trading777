
import axios from 'axios';

const API_KEY = import.meta.env.VITE_FINNHUB_KEY;

export async function fetchQuotes(symbols = []) {
  const result = {};
  await Promise.all(symbols.map(async sym => {
    try {
      const { data } = await axios.get('https://finnhub.io/api/v1/quote', {
        params: { symbol: sym, token: API_KEY }
      });
      result[sym] = data.c ?? null;
    } catch {
      result[sym] = null;
    }
  }));
  return result;
}
