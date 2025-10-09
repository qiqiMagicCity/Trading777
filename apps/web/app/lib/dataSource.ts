import { migrateClosePriceMap } from "@/lib/closePriceMigration";
import { getOfficialCloseMapFromCache } from "@/lib/services/dataService";
import { toNumericClosePriceMap, type ClosePriceMap } from "./dailyResults";
import {
  computeClosePricesVersion,
  getClosePricesFetchInfo,
  writeStoredClosePricesVersion,
} from "@/app/lib/prices/closePriceFetch";

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

async function loadClosePricesFromIdb(): Promise<Record<string, Record<string, number>>> {
  if (typeof indexedDB === "undefined") {
    return {};
  }
  try {
    const map = await getOfficialCloseMapFromCache();
    if (!map || typeof map !== "object") {
      return {};
    }
    // map 已经过 migrateClosePriceMap 处理，确保结构一致
    return toNumericClosePriceMap(map);
  } catch (error) {
    console.warn("[dataSource] fallback to IndexedDB failed", error);
    return {};
  }
}

function applyClosePriceMigration(raw: unknown) {
  const { map } = migrateClosePriceMap(raw);
  return map;
}

export async function loadJson(name: 'trades'|'initial_positions'|'close_prices') {
  const key = name === 'close_prices' ? null : `jsonver:${name}`;
  const stored = key ? safeGetLocalStorageItem(key) : null;
  const closeInfo = name === 'close_prices' ? getClosePricesFetchInfo() : null;
  const versionForUrl = name === 'close_prices'
    ? closeInfo!.versionForUrl
    : stored || String(Date.now());
  const url = name === 'close_prices'
    ? closeInfo!.url
    : `/${name}.json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        const result =
          name === 'close_prices'
            ? toNumericClosePriceMap(applyClosePriceMigration(data) as ClosePriceMap)
            : data;
        if (name === 'close_prices') {
          const version = computeClosePricesVersion(res, result);
          writeStoredClosePricesVersion(version);
        } else if (!stored && key) {
          safeSetLocalStorageItem(key, versionForUrl);
        }
        return result;
      }
    }
  } catch {
    // ignore fetch errors
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
