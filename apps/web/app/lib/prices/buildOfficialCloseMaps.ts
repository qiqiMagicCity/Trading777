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

export interface OfficialCloseBuildResult {
  maps: OfficialCloseMaps;
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

export async function buildOfficialCloseMaps(): Promise<OfficialCloseBuildResult> {
  const [fileClosePricesRaw, cachedPrices, overlayEntries] = await Promise.all([
    loadJson("close_prices") as Promise<Record<string, Record<string, number>>>,
    getAllPrices(),
    readOfficialCloseOverlay(),
  ]);

  const normalizedFileCloses = normalizeClosePriceMap(fileClosePricesRaw, {
    defaultSource: "official/packaged",
  });
  const overlayMap = overlayEntriesToMap(overlayEntries);
  const cachedFallbackCloses = closePricesFromRows(
    cachedPrices.filter((row) => !isOfficialCloseSource(row.source)),
  );
  const cachedOfficialCloses = closePricesFromRows(
    cachedPrices.filter((row) => isOfficialCloseSource(row.source)),
  );

  const officialCloseMap = mergeClosePriceMaps(
    cachedOfficialCloses,
    normalizedFileCloses,
    overlayMap,
  );
  const mergedCloseMap = mergeClosePriceMaps(
    cachedFallbackCloses,
    cachedOfficialCloses,
    normalizedFileCloses,
    overlayMap,
  );

  const nextVersion = officialCloseVersion + 1;

  return {
    maps: {
      overlay: overlayMap,
      official: officialCloseMap,
      merged: mergedCloseMap,
      fallback: cachedFallbackCloses,
    },
    version: nextVersion,
  };
}
