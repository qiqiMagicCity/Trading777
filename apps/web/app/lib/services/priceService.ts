
import { getPrice, putPrice } from "./dataService";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

const FINNHUB_TOKEN_ENV = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
const ALPHA_TOKEN_ENV = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_TOKEN;

let runtimeKeys = null;
async function loadKeysTxt() {
  if (runtimeKeys) return runtimeKeys;
  try {
    const txt = await fetch("/KEY.txt").then(r => r.text());
    const finnhubKey = txt.match(/Finnhub\s+key[：: ]([A-Za-z0-9]+)/i)?.[1];
    const alphaKey = txt.match(/Alpha\s+key[：: ]([A-Za-z0-9]+)/i)?.[1];
    runtimeKeys = { finnhub: finnhubKey, alpha: alphaKey };
  } catch (e) {
    runtimeKeys = {};
  }
  return runtimeKeys;
}

async function getFinnhubToken() {
  if (FINNHUB_TOKEN_ENV) return FINNHUB_TOKEN_ENV;
  return (await loadKeysTxt()).finnhub;
}
async function getAlphaToken() {
  if (ALPHA_TOKEN_ENV) return ALPHA_TOKEN_ENV;
  return (await loadKeysTxt()).alpha;
}

async function fetchFinnhubQuote(symbol) {
  const token = await getFinnhubToken();
  if (!token) return null;
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  try {
    const json = await fetch(url).then(r => r.json());
    return typeof json.c === "number" && json.c > 0 ? json.c : null;
  } catch (e) {
    return null;
  }
}

async function fetchAlphaQuote(symbol) {
  const token = await getAlphaToken();
  if (!token) return null;
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${token}`;
  try {
    const json = await fetch(url).then(r => r.json());
    if (json.Note) return null;
    const priceStr = json["Global Quote"]?.["05. price"];
    return priceStr ? parseFloat(priceStr) : null;
  } catch (e) {
    return null;
  }
}

export async function fetchRealtimePrice(symbol) {
  const price = (await fetchFinnhubQuote(symbol)) ?? (await fetchAlphaQuote(symbol));
  return price ?? null;
}

export async function fetchDailyClose(symbol, date) {
  const cached = await getPrice(symbol, date);
  if (cached) return cached.close;

  const finnhubToken = await getFinnhubToken();
  if (finnhubToken) {
    const from = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
    const to = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
    const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${finnhubToken}`;
    try {
      const json = await fetch(url).then(r => r.json());
      if (json?.c?.[0]) {
        const close = json.c[0];
        await putPrice({ symbol, date, close, source: "finnhub" });
        return close;
      }
    } catch {}
  }

  const alphaToken = await getAlphaToken();
  if (alphaToken) {
    const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${alphaToken}`;
    try {
      const json = await fetch(url).then(r => r.json());
      const closeStr = json["Time Series (Daily)"]?.[date]?.["4. close"];
      if (closeStr) {
        const close = parseFloat(closeStr);
        await putPrice({ symbol, date, close, source: "alphavantage" });
        return close;
      }
    } catch {}
  }

  throw new Error(`Unable to fetch close price for ${symbol} on ${date}`);
}
