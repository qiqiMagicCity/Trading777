const VERSION_KEY = "close_prices_version";

type NullableString = string | null | undefined;

function safeReadLocalStorage(key: string): string | null {
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

function safeWriteLocalStorage(key: string, value: string): void {
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

function normalizeBasePath(candidate: NullableString): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }
  if (trimmed === "/") return "";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/$/, "");
}

function readRuntimeBasePath(): string | null {
  const globalAny = globalThis as Record<string, unknown>;
  const windowAny = typeof window !== "undefined" ? (window as Record<string, unknown>) : null;

  const candidates: NullableString[] = [
    windowAny?.__NEXT_DATA__ && typeof windowAny.__NEXT_DATA__ === "object"
      ? (windowAny.__NEXT_DATA__ as Record<string, unknown>).assetPrefix as NullableString
      : null,
    windowAny?.__NEXT_DATA__ && typeof windowAny.__NEXT_DATA__ === "object"
      ? (windowAny.__NEXT_DATA__ as Record<string, unknown>).basePath as NullableString
      : null,
    windowAny?.__NEXT_ROUTER_BASEPATH as NullableString,
    globalAny?.__NEXT_DATA__ && typeof globalAny.__NEXT_DATA__ === "object"
      ? (globalAny.__NEXT_DATA__ as Record<string, unknown>).assetPrefix as NullableString
      : null,
    globalAny?.NEXT_PUBLIC_BASE_PATH as NullableString,
    process?.env?.NEXT_PUBLIC_BASE_PATH,
    process?.env?.NEXT_PUBLIC_ASSET_PREFIX,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBasePath(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }
  return "";
}

export interface ClosePricesFetchInfo {
  storedVersion: string | null;
  versionForUrl: string;
  url: string;
}

export function readStoredClosePricesVersion(): string | null {
  return safeReadLocalStorage(VERSION_KEY);
}

export function writeStoredClosePricesVersion(version: string): void {
  safeWriteLocalStorage(VERSION_KEY, version);
}

export function getClosePricesBasePath(): string {
  return readRuntimeBasePath() ?? "";
}

function joinPath(base: string, resource: string): string {
  if (!base) return resource;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedResource = resource.startsWith("/") ? resource.slice(1) : resource;
  return `${trimmedBase}/${trimmedResource}`;
}

export function getClosePricesUrl(version?: string | null): string {
  const base = getClosePricesBasePath();
  const core = joinPath(base, "/close_prices.json");
  if (!version) {
    return core;
  }
  const delimiter = core.includes("?") ? "&" : "?";
  return `${core}${delimiter}v=${encodeURIComponent(version)}`;
}

export function getClosePricesFetchInfo(): ClosePricesFetchInfo {
  const stored = readStoredClosePricesVersion();
  const versionForUrl = stored ?? String(Date.now());
  return {
    storedVersion: stored,
    versionForUrl,
    url: getClosePricesUrl(versionForUrl),
  };
}

export function computeClosePricesVersion(
  response: Response,
  payload: unknown,
): string {
  const etag = response.headers.get("etag");
  if (etag && etag.trim()) {
    return etag.trim();
  }
  const lastModified = response.headers.get("last-modified");
  if (lastModified && lastModified.trim()) {
    return lastModified.trim();
  }
  const json = JSON.stringify(payload ?? null);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return `hash:${hash.toString(16)}`;
}

export { VERSION_KEY as CLOSE_PRICES_VERSION_KEY };
