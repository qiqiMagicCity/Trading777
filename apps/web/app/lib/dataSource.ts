import { migrateClosePriceMap } from "@/lib/closePriceMigration";
import { getOfficialCloseMapFromCache } from "@/lib/services/dataService";
import { normalizeCloseMap, type CloseMapByDate } from "./prices/normalizeCloseMap";
import {
  fetchClosePricesResource,
  getClosePricesFetchInfo,
  isOfficialCloseFixEnabled,
} from "@/app/lib/prices/officialCloseFacade";

function safeGetLocalStorageItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function safeSetLocalStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage errors
  }
}

async function loadClosePricesFromIdb(): Promise<CloseMapByDate> {
  if (typeof indexedDB === "undefined") {
    return {};
  }
  try {
    const map = await getOfficialCloseMapFromCache();
    if (!map || typeof map !== "object") {
      return {};
    }
    // map 已经过 migrateClosePriceMap 处理，确保结构一致
    return normalizeCloseMap(map);
  } catch (error) {
    console.warn("[dataSource] fallback to IndexedDB failed", error);
    return {};
  }
}

function applyClosePriceMigration(raw: unknown): CloseMapByDate {
  const { map } = migrateClosePriceMap(raw);
  return normalizeCloseMap(map);
}

async function loadClosePricesWithFix(): Promise<CloseMapByDate> {
  const result = await fetchClosePricesResource();
  if (result.ok && result.bodyText) {
    try {
      const parsed = JSON.parse(result.bodyText) as unknown;
      return applyClosePriceMigration(parsed);
    } catch (error) {
      console.warn("[dataSource] parse close_prices.json failed", error);
    }
  }
  const fallback = await loadClosePricesFromIdb();
  if (fallback && Object.keys(fallback).length > 0) {
    return fallback;
  }
  throw new Error(
    'close_prices.json 加载失败。请通过页面右上角“导入收盘价”按钮补录上一纽约交易日(E-1)的官方昨收后重试。',
  );
}

export async function loadJson(name: 'trades'|'initial_positions'|'close_prices') {
  if (name === 'close_prices' && isOfficialCloseFixEnabled()) {
    return loadClosePricesWithFix();
  }

  const key = name === 'close_prices' ? 'close_prices_version' : `jsonver:${name}`;
  const stored = safeGetLocalStorageItem(key);
  const version = stored || String(Date.now());
  const fetchInfo =
    name === 'close_prices'
      ? getClosePricesFetchInfo({ version })
      : { url: `/${name}.json`, init: { cache: 'no-store' as const } };
  try {
    const response = await fetch(fetchInfo.url, fetchInfo.init);
    if (response.ok) {
      const data = await response.json();
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        const result = name === 'close_prices' ? applyClosePriceMigration(data) : data;
        if (!stored) {
          safeSetLocalStorageItem(key, version);
        }
        return result;
      }
    }
  } catch (error) {
    console.warn(`[dataSource] legacy loadJson(${name}) failed`, error);
  }

  if (name === 'close_prices') {
    const fallback = await loadClosePricesFromIdb();
    if (fallback && Object.keys(fallback).length > 0) {
      return fallback;
    }
    throw new Error(
      'close_prices.json 加载失败。请通过页面右上角“导入收盘价”按钮补录上一纽约交易日(E-1)的官方昨收后重试。',
    );
  }

  switch (name) {
    case 'trades':
      return (await import('../../public/trades.json')).default;
    case 'initial_positions':
      return (await import('../../public/initial_positions.json')).default;
  }
}
