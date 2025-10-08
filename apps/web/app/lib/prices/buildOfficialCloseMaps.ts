import { loadJson } from "@/app/lib/dataSource";
import {
  closePricesFromRows,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
  type ClosePriceMap,
} from "@/app/lib/dailyResults";
import { overlayEntriesToMap, readOfficialCloseOverlay } from "@/app/lib/officialCloseOverlayStore";
import { isOfficialCloseSource } from "@/app/lib/priceSourceGuards";
import { getAllPrices } from "@/app/lib/services/dataService";

export interface OfficialCloseMaps {
  overlay: ClosePriceMap;
  official: ClosePriceMap;
  merged: ClosePriceMap;
  fallback: ClosePriceMap;
}

export async function buildOfficialCloseMaps(): Promise<OfficialCloseMaps> {
  const [fileClosePricesRaw, cachedPrices, overlayEntries] = await Promise.all([
    loadJson("close_prices") as Promise<Record<string, Record<string, number>>>,
    getAllPrices(),
    readOfficialCloseOverlay(),
  ]);

  const normalizedFileCloses = normalizeClosePriceMap(fileClosePricesRaw);
  const overlayMap = overlayEntriesToMap(overlayEntries);
  const cachedFallbackCloses = closePricesFromRows(
    cachedPrices.filter((row) => !isOfficialCloseSource(row.source)),
  );
  const cachedOfficialCloses = closePricesFromRows(
    cachedPrices.filter((row) => isOfficialCloseSource(row.source)),
  );

  const officialCloseMap = mergeClosePriceMaps(
    overlayMap,
    normalizedFileCloses,
    cachedOfficialCloses,
  );
  const mergedCloseMap = mergeClosePriceMaps(
    cachedFallbackCloses,
    overlayMap,
    normalizedFileCloses,
    cachedOfficialCloses,
  );

  return {
    overlay: overlayMap,
    official: officialCloseMap,
    merged: mergedCloseMap,
    fallback: cachedFallbackCloses,
  };
}
