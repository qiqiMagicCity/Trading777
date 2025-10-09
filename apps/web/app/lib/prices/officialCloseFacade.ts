import type { ClosePriceMap } from "@/app/lib/dailyResults";
import { summarizeMissingOfficialCloses } from "@/app/lib/diagnostics/missingBanner";
import type { MissingOfficialSymbolSummary } from "@/app/lib/missingOfficialClose";
import {
  buildOfficialCloseMaps,
  commitOfficialCloseVersion,
  getOfficialCloseVersion,
  type OfficialCloseBuildResult,
  type OfficialCloseDebugMaps,
  type OfficialCloseDetailMap,
  type OfficialCloseEntry,
  type OfficialCloseLayer,
} from "@/app/lib/prices/buildOfficialCloseMaps";
import {
  getClosePricesFetchInfo as baseGetClosePricesFetchInfo,
  getClosePricesUrl as baseGetClosePricesUrl,
} from "@/app/lib/prices/closePricesFetch";
import {
  CLOSE_PRICES_VERSION_EVENT,
  readClosePricesVersion,
  readClosePricesVersionMeta,
  writeClosePricesVersion,
  type ClosePricesVersionMeta,
  type ClosePricesVersionReason,
} from "@/app/lib/prices/closePricesVersion";
import {
  importClosePricesInternal,
  type ImportClosePricesResult,
} from "@/app/lib/prices/importClosePrices";
import {
  getLastPackagedSyncStats,
  shouldSyncPackagedToIdb,
  syncPackagedClosesToIdb as syncPackagedClosesToIdbImpl,
  type SyncPackagedClosesStats,
} from "@/app/lib/prices/syncPackagedClosesToIdb";
import { waitUntilAtLeast } from "@/app/lib/prices/ready";
import { isOfficialCloseFixEnabled as readFlag } from "@/app/lib/prices/officialCloseFeatureFlag";
import { useStore } from "@/app/lib/store";

export type { OfficialCloseDetailMap, OfficialCloseEntry, OfficialCloseLayer };
export type { SyncPackagedClosesStats };

export {
  readClosePricesVersion,
  readClosePricesVersionMeta,
  getLastPackagedSyncStats,
  shouldSyncPackagedToIdb,
  getOfficialCloseVersion,
};

export function isOfficialCloseFixEnabled(): boolean {
  return readFlag();
}

export function getClosePricesUrl(options?: { version?: string }): string {
  return baseGetClosePricesUrl(options);
}

export function getClosePricesFetchInfo(options?: { version?: string }) {
  return baseGetClosePricesFetchInfo(options);
}

function normalizeSource(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

function isImportSource(source: string | undefined): boolean {
  if (!source) return false;
  const normalized = source.trim().toLowerCase();
  return normalized.startsWith("official/import");
}

function ensureEntryContainer<T>(
  map: Record<string, Record<string, T>>,
  symbol: string,
): Record<string, T> {
  const key = symbol.trim().toUpperCase();
  if (!map[key]) {
    map[key] = {} as Record<string, T>;
  }
  return map[key]!;
}

function upsertEntry(
  detail: OfficialCloseDetailMap,
  symbol: string,
  date: string,
  entry: OfficialCloseEntry,
): void {
  const target = ensureEntryContainer(detail, symbol);
  const normalizedSource = normalizeSource(entry.source, "official/import");
  const existing = target[date];
  if (existing && isImportSource(existing.source) && entry.fromLayer !== "overlay") {
    return;
  }
  target[date] = {
    price: entry.price,
    source: normalizedSource,
    fromLayer: entry.fromLayer,
  };
}

function applyLayer(
  detail: OfficialCloseDetailMap,
  map: ClosePriceMap,
  fromLayer: OfficialCloseLayer,
  sourceTag: string,
) {
  for (const [symbol, byDate] of Object.entries(map)) {
    for (const [date, price] of Object.entries(byDate)) {
      if (!Number.isFinite(price)) continue;
      upsertEntry(detail, symbol, date, {
        price,
        source: sourceTag,
        fromLayer,
      });
    }
  }
}

export function mergeOfficialCloses(
  idb: ClosePriceMap,
  packaged: ClosePriceMap,
  overlay: ClosePriceMap,
): { detail: OfficialCloseDetailMap; map: ClosePriceMap } {
  const detail: OfficialCloseDetailMap = {};
  applyLayer(detail, idb, "idb", "official/import");
  applyLayer(detail, packaged, "packaged", "official/packaged");
  applyLayer(detail, overlay, "overlay", "official/import");
  const map: ClosePriceMap = {};
  for (const [symbol, byDate] of Object.entries(detail)) {
    const target = ensureEntryContainer(map, symbol);
    for (const [date, entry] of Object.entries(byDate)) {
      target[date] = entry.price;
    }
  }
  return { detail, map };
}

export function refreshCloseVersion(meta: {
  reason: ClosePricesVersionReason;
  etag?: string | null;
  lastModified?: string | null;
  hash?: string | null;
  versionOverride?: string | null;
}): string {
  const candidates: Array<string | null | undefined> = [
    meta.versionOverride,
    meta.etag,
    meta.lastModified,
    meta.hash,
  ];
  let version = "";
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.replace(/^W\//i, "").replace(/"/g, "").trim();
    if (!trimmed) continue;
    if (candidate === meta.lastModified) {
      const ts = Date.parse(trimmed);
      if (!Number.isNaN(ts)) {
        version = `lm:${ts}`;
        break;
      }
      continue;
    }
    if (candidate === meta.etag) {
      version = `etag:${trimmed}`;
      break;
    }
    version = trimmed;
    break;
  }
  if (!version) {
    version = String(Date.now());
  }
  writeClosePricesVersion(version, meta.reason);
  return version;
}

export type ClosePricesVersionListener = (meta: ClosePricesVersionMeta | null) => void;

export function subscribeClosePricesVersion(
  listener: ClosePricesVersionListener,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const storageHandler = (event: StorageEvent) => {
    if (event.key !== "close_prices_version" && event.key !== null) {
      return;
    }
    listener(readClosePricesVersionMeta());
  };
  const customHandler = () => {
    listener(readClosePricesVersionMeta());
  };
  window.addEventListener("storage", storageHandler);
  window.addEventListener(CLOSE_PRICES_VERSION_EVENT, customHandler as EventListener);
  return () => {
    window.removeEventListener("storage", storageHandler);
    window.removeEventListener(
      CLOSE_PRICES_VERSION_EVENT,
      customHandler as EventListener,
    );
  };
}

function computeBodyHash(body: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `hash:${(hash >>> 0).toString(16)}`;
}

export interface FetchClosePricesResult {
  ok: boolean;
  status: number;
  bodyText?: string;
  version?: string;
}

async function fetchWith403Fallback(url: string, init: RequestInit) {
  let response = await fetch(url, init);
  if (response.status === 403) {
    const proxyUrl = "/api/close-prices";
    response = await fetch(proxyUrl, { ...init, cache: "no-store" });
  }
  return response;
}

export async function fetchClosePricesResource(
  options: { version?: string } = {},
): Promise<FetchClosePricesResult> {
  const { url, init } = getClosePricesFetchInfo(options);
  try {
    const response = await fetchWith403Fallback(url, init);
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, status: response.status, bodyText: text };
    }
    const version = refreshCloseVersion({
      reason: "fetch",
      etag: response.headers.get("etag") ?? response.headers.get("ETag"),
      lastModified:
        response.headers.get("last-modified") ??
        response.headers.get("Last-Modified"),
      hash: text ? computeBodyHash(text) : null,
    });
    return { ok: true, status: response.status, bodyText: text, version };
  } catch (error) {
    console.warn("[officialCloseFacade] fetch close_prices failed", error);
    return { ok: false, status: 0 };
  }
}

export async function rebuildOfficialCloseMapsWithCommit(): Promise<OfficialCloseBuildResult> {
  const result = await buildOfficialCloseMaps();
  commitOfficialCloseVersion(result.version);
  return result;
}

export async function syncPackagedClosesToIdb(): Promise<SyncPackagedClosesStats> {
  return syncPackagedClosesToIdbImpl();
}

export async function importClosePrices(
  raw: Record<string, Record<string, number>> | unknown,
): Promise<ImportClosePricesResult> {
  const result = await importClosePricesInternal(raw);
  if (result.writebackStatus === "success" || result.writebackStatus === "skipped") {
    refreshCloseVersion({ reason: "import" });
  }
  return result;
}

export type OfficialCloseDebugState = {
  maps: OfficialCloseDebugMaps | undefined;
  version: number;
};

export async function getOfficialCloseDebugState(): Promise<OfficialCloseDebugState> {
  const result = await buildOfficialCloseMaps();
  return { maps: result.debug, version: result.version };
}

export type MissingOfficialCloseMap = Record<string, MissingOfficialSymbolSummary[]>;

export async function waitOfficialClosesReady(targetVersion?: number) {
  const baseVersion =
    typeof targetVersion === "number" ? targetVersion : getOfficialCloseVersion();
  await waitUntilAtLeast(baseVersion);
}

export async function getMissingOfficialCloses(
  targetVersion?: number,
): Promise<MissingOfficialCloseMap> {
  const version =
    typeof targetVersion === "number" ? targetVersion : getOfficialCloseVersion();
  await waitOfficialClosesReady(version);
  const metrics = useStore.getState().metrics;
  const entries = metrics?.diagnostics?.missingOfficialCloses ?? [];
  const summaries = summarizeMissingOfficialCloses(entries);
  const map: MissingOfficialCloseMap = {};
  for (const summary of summaries) {
    map[summary.ymd] = summary.symbols.slice();
  }
  return map;
}
