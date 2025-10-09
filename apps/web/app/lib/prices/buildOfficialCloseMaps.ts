import { loadJson } from "@/app/lib/dataSource";
import {
  closePricesFromRows,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
  type ClosePriceMap,
} from "@/app/lib/dailyResults";
import {
  overlayEntriesToMap,
  readOfficialCloseOverlay,
  type OfficialCloseOverlayRecord,
} from "@/app/lib/officialCloseOverlayStore";
import { isOfficialCloseSource } from "@/app/lib/priceSourceGuards";
import { getAllPrices, type CachedPrice } from "@/app/lib/services/dataService";
import {
  isHigherPriority,
  normalizeOfficialSourceTag,
} from "@/app/lib/prices/compareOfficialSourcePriority";

export interface OfficialCloseMaps {
  overlay: ClosePriceMap;
  official: ClosePriceMap;
  merged: ClosePriceMap;
  fallback: ClosePriceMap;
  packaged: ClosePriceMap;
}

export interface OfficialCloseDebugMaps {
  packaged: ClosePriceMap;
  idb: ClosePriceMap;
  overlay: ClosePriceMap;
  detail: OfficialCloseDetailMap;
  officialPrices: ClosePriceMap;
}

export interface OfficialCloseBuildResult {
  maps: OfficialCloseMaps;
  debug?: OfficialCloseDebugMaps;
  version: number;
}

let officialCloseVersion = 0;

export function getOfficialCloseVersion(): number {
  return officialCloseVersion;
}

export function commitOfficialCloseVersion(version: number): void {
  if (version > officialCloseVersion) {
    officialCloseVersion = version;
  }
}

export function resetOfficialCloseVersionForTests(): void {
  officialCloseVersion = 0;
}

export type OfficialCloseLayer = "overlay" | "packaged" | "idb";

export interface OfficialCloseEntry {
  price: number;
  source: string;
  fromLayer: OfficialCloseLayer;
}

export type OfficialCloseDetailMap = Record<string, Record<string, OfficialCloseEntry>>;

function ensureEntryContainer<T>(
  map: Record<string, Record<string, T>>,
  symbol: string,
): Record<string, T> {
  if (!map[symbol]) {
    map[symbol] = {} as Record<string, T>;
  }
  return map[symbol]!;
}

function upsertOfficialEntry(
  map: OfficialCloseDetailMap,
  symbol: string,
  date: string,
  entry: OfficialCloseEntry,
): void {
  const target = ensureEntryContainer(map, symbol);
  const existing = target[date];
  const normalizedSource = normalizeOfficialSourceTag(entry.source ?? "official/import");
  if (existing && entry.fromLayer !== "overlay") {
    const existingSource = normalizeOfficialSourceTag(existing.source);
    if (!isHigherPriority(normalizedSource, existingSource)) {
      return;
    }
  }
  target[date] = {
    ...entry,
    source: normalizedSource,
  };
}

function buildDetailMapFromRows(rows: CachedPrice[]): OfficialCloseDetailMap {
  const detailMap: OfficialCloseDetailMap = {};
  for (const row of rows) {
    const symbol = row.symbol?.trim().toUpperCase();
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    const price = Number(row.close);
    if (!symbol || !date || !Number.isFinite(price)) {
      continue;
    }
    upsertOfficialEntry(detailMap, symbol, date, {
      price,
      source: row.source ?? "official/import",
      fromLayer: "idb",
    });
  }
  return detailMap;
}

function buildDetailMapFromNumeric(
  map: ClosePriceMap,
  source: string,
  fromLayer: OfficialCloseLayer,
): OfficialCloseDetailMap {
  const detail: OfficialCloseDetailMap = {};
  for (const [symbol, byDate] of Object.entries(map)) {
    for (const [date, price] of Object.entries(byDate)) {
      upsertOfficialEntry(detail, symbol, date, { price, source, fromLayer });
    }
  }
  return detail;
}

function buildDetailMapFromOverlay(entries: OfficialCloseOverlayRecord[]): OfficialCloseDetailMap {
  const detail: OfficialCloseDetailMap = {};
  for (const entry of entries) {
    upsertOfficialEntry(detail, entry.symbol, entry.date, {
      price: entry.price,
      source: "official/import",
      fromLayer: "overlay",
    });
  }
  return detail;
}

function mergeDetailMaps(...maps: OfficialCloseDetailMap[]): OfficialCloseDetailMap {
  const result: OfficialCloseDetailMap = {};
  for (const map of maps) {
    for (const [symbol, byDate] of Object.entries(map)) {
      for (const [date, entry] of Object.entries(byDate)) {
        upsertOfficialEntry(result, symbol, date, entry);
      }
    }
  }
  return result;
}

function detailMapToPrices(detail: OfficialCloseDetailMap): ClosePriceMap {
  const result: ClosePriceMap = {};
  for (const [symbol, byDate] of Object.entries(detail)) {
    const target = ensureEntryContainer(result, symbol);
    for (const [date, entry] of Object.entries(byDate)) {
      target[date] = entry.price;
    }
  }
  return result;
}

export async function buildOfficialCloseMaps(): Promise<OfficialCloseBuildResult> {
  const [fileClosePricesRaw, cachedPrices, overlayEntries] = await Promise.all([
    loadJson("close_prices") as Promise<Record<string, Record<string, number>>>,
    getAllPrices(),
    readOfficialCloseOverlay(),
  ]);

  const normalizedFileCloses = normalizeClosePriceMap(fileClosePricesRaw);
  const packagedDetail = buildDetailMapFromNumeric(
    normalizedFileCloses,
    "official/packaged",
    "packaged",
  );
  const overlayDetail = buildDetailMapFromOverlay(overlayEntries);
  const overlayMap = overlayEntriesToMap(overlayEntries);

  const officialRows = cachedPrices.filter((row) => isOfficialCloseSource(row.source));
  const cachedFallbackCloses = closePricesFromRows(
    cachedPrices.filter((row) => !isOfficialCloseSource(row.source)),
  );
  const idbDetail = buildDetailMapFromRows(officialRows);

  const officialDetailMap = mergeDetailMaps(idbDetail, packagedDetail, overlayDetail);
  const officialPriceMap = detailMapToPrices(officialDetailMap);
  const mergedCloseMap = mergeClosePriceMaps(cachedFallbackCloses, officialPriceMap);

  const nextVersion = officialCloseVersion + 1;

  return {
    maps: {
      overlay: overlayMap,
      official: officialPriceMap,
      merged: mergedCloseMap,
      fallback: cachedFallbackCloses,
      packaged: normalizedFileCloses,
    },
    debug: {
      packaged: normalizedFileCloses,
      idb: closePricesFromRows(officialRows),
      overlay: overlayMap,
      detail: officialDetailMap,
      officialPrices: officialPriceMap,
    },
    version: nextVersion,
  };
}
