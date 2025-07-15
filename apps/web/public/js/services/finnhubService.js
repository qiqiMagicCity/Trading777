
/**
 * finnhubService.js - Fetch daily close prices with cache & fallback
 * v7.26
 */
import { apiQueue } from './apiQueue.js';
import { putPrice, getPrice } from '../lib/idb.js';

const TOKEN_KEY = 'FINNHUB_TOKEN';
const API_BASE  = 'https://finnhub.io/api/v1';

/** Return stored token or fallback demo token */
export function getToken(){
  return localStorage.getItem(TOKEN_KEY) || 'd19cvm9r01qmm7tudrk0d19cvm9r01qmm7tudrkg';
}

/**
 * Fetch daily close from Finnhub.
 * @param {string} symbol
 * @param {string} date YYYY-MM-DD
 * @returns {number|null}
 */
export async function fetchFinnhubDailyClose(symbol, date){
  const fromTs = Math.floor(new Date(date + 'T00:00:00Z').getTime()/1000);
  const toTs   = Math.floor(new Date(date + 'T23:59:59Z').getTime()/1000);
  const url = `${API_BASE}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${fromTs}&to=${toTs}&token=${getToken()}`;
  try{
    const json = await apiQueue.enqueue(()=> fetch(url).then(r=>r.json()));
    if(json && json.c && json.c.length){
      const close = json.c[0];
      await putPrice(symbol, date, close, 'finnhub');
      return close;
    }
  }catch(e){
    console.warn('Finnhub fetch error', e);
  }
  return null;
}

/**
 * Fallback – AlphaVantage daily close
 */
export async function fetchAlphaClose(symbol, date){
  const apiKey = '7WVA9HZ4BCR6BR30';
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${apiKey}`;
  try{
    const json = await fetch(url).then(r=>r.json());
    const series = json['Time Series (Daily)'];
    if(series && series[date] && series[date]['4. close']){
      const close = parseFloat(series[date]['4. close']);
      await putPrice(symbol, date, close, 'alphavantage');
      return close;
    }
  }catch(e){
    console.warn('AlphaVantage fallback failed', e);
  }
  return null;
}

/**
 * Unified fetch: cache -> Finnhub -> AlphaVantage
 */
export async function fetchDailyClose(symbol, date){
  const cached = await getPrice(symbol, date);
  if(cached) return cached.close;
  const fh = await fetchFinnhubDailyClose(symbol, date);
  if(fh != null) return fh;
  const av = await fetchAlphaClose(symbol, date);
  if(av != null) return av;
  throw new Error('无法获取收盘价');
}
