/**
 * priceService.js – browser‑only version (v7.71)
 * Fetches realtime quotes from Finnhub and stores daily closes in IndexedDB.
 * No Node.js fs/path required – works on Vercel static hosting.
 */
import { putPrice } from '../lib/idb.js';

/** milliseconds to cache realtime quotes in localStorage */
const RT_CACHE_MS = 60_000;

/** Lazy‑load API keys from /KEY.txt (placed at repo root) */
let _keys = null;
async function loadKeys(){
  if(_keys) return _keys;
  try{
    const res = await fetch('/KEY.txt');
    const txt = await res.text();
    const lines = txt.split(/\r?\n/);
    const obj = {};
    for(const line of lines){
      const [k,v] = line.split('=');
      if(k && v){
        obj[k.trim()] = v.trim();
      }else if(line.toLowerCase().includes('finnhub')){
        const m = line.match(/([A-Za-z0-9]{20,})/);
        if(m) obj.finnhub = m[1];
      }else if(line.toLowerCase().includes('alpha')){
        const m = line.match(/([A-Za-z0-9]{10,})/);
        if(m) obj.alpha = m[1];
      }
    }
    _keys = {
      alpha: obj.ALPHA_KEY || obj.alpha,
      finnhub: obj.Finnhub || obj.finnhub
    };
    return _keys;
  }catch(e){
    console.error('[priceService] failed to load KEY.txt', e);
    _keys = {};
    return _keys;
  }
}

/**
 * Fetch realtime price for a symbol with 1‑minute local cache.
 * @param {string} symbol
 * @returns {Promise<number|null>}
 */
export async function fetchRealtimePrice(symbol){
  const cacheKey = `rt_${symbol}`;
  try{
    const cached = JSON.parse(localStorage.getItem(cacheKey)||'null');
    if(cached && Date.now() - cached.ts < RT_CACHE_MS){
      return cached.price;
    }
  }catch{}

  const { finnhub } = await loadKeys();
  if(!finnhub){
    console.warn('[priceService] Finnhub API key missing');
    return null;
  }
  try{
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhub}`;
    const res = await fetch(url);
    const json = await res.json();
    const price = json.c ?? json.current ?? null;
    if(price!=null){
      localStorage.setItem(cacheKey, JSON.stringify({price, ts: Date.now()}));
    }
    return price;
  }catch(e){
    console.error('[priceService] fetchRealtimePrice', symbol, e);
    return null;
  }
}

/**
 * Save today's closing price in IndexedDB.
 * Called by closeRecorder.js after market close.
 */
export async function saveDailyClose(symbol, price){
  const todayStr = new Date().toISOString().slice(0,10);
  await putPrice(symbol, todayStr, price, 'finnhub');
}

/**
 * Bulk save close prices. Accepts {[symbol]:price}
 */
export async function saveDailyClosesBulk(map){
  const entries = Object.entries(map);
  for(const [sym, price] of entries){
    await saveDailyClose(sym, price);
  }
}

/** Placeholder stubs for old API compatibility */
export async function fetchDailySeries(){ return {}; }
export async function fetchDailyCandles(){ return {}; }

/**
 * getTrackedSymbols – try localStorage.trades; otherwise empty array
 */
export function getTrackedSymbols(){
  try{
    const trades = JSON.parse(localStorage.getItem('trades')||'[]');
    return [...new Set(trades.map(t=>t.symbol).filter(Boolean))];
  }catch{
    return [];
  }
}