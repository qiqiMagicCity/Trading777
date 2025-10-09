import { readClosePricesVersion } from "@/app/lib/prices/closePricesVersion";

interface ClosePricesUrlOptions {
  version?: string;
}

function normalizePrefix(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  let normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  normalized = normalized.replace(/\/+$/, "");
  if (normalized === "/") {
    return "";
  }
  return normalized;
}

function resolveRuntimePrefix(): string | null {
  if (typeof window !== "undefined") {
    const win = window as typeof window & {
      __NEXT_DATA__?: { assetPrefix?: string | null; runtimeConfig?: Record<string, any> };
      __NEXT_ROUTER_BASEPATH?: string;
    };
    const dataPrefix = normalizePrefix(win.__NEXT_DATA__?.assetPrefix ?? null);
    if (dataPrefix !== null) {
      return dataPrefix;
    }
    const routerPrefix = normalizePrefix(win.__NEXT_ROUTER_BASEPATH ?? null);
    if (routerPrefix !== null) {
      return routerPrefix;
    }
  } else {
    const envBase = normalizePrefix(process.env.__NEXT_ROUTER_BASEPATH ?? null);
    if (envBase !== null) {
      return envBase;
    }
    const envAsset = normalizePrefix(process.env.__NEXT_ASSET_PREFIX ?? null);
    if (envAsset !== null) {
      return envAsset;
    }
  }
  return null;
}

function resolvePublicPrefix(): string {
  const candidates: Array<string | undefined | null> = [
    process.env.NEXT_PUBLIC_BASE_PATH,
    process.env.NEXT_PUBLIC_ASSET_PREFIX,
    process.env.BASE_PATH,
    process.env.ASSET_PREFIX,
  ];
  for (const candidate of candidates) {
    const normalized = normalizePrefix(candidate ?? null);
    if (normalized !== null) {
      return normalized;
    }
  }
  const runtime = resolveRuntimePrefix();
  if (runtime !== null) {
    return runtime;
  }
  return "";
}

function joinPublicPath(prefix: string, pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!prefix) {
    return normalizedPath;
  }
  if (/^https?:\/\//i.test(prefix)) {
    return `${prefix.replace(/\/+$/, "")}${normalizedPath}`;
  }
  const normalizedPrefix = prefix === "/" ? "" : prefix.replace(/\/+$/, "");
  return `${normalizedPrefix}${normalizedPath}`;
}

export function getClosePricesUrl(options: ClosePricesUrlOptions = {}): string {
  const prefix = resolvePublicPrefix();
  const base = joinPublicPath(prefix, "/close_prices.json");
  if (!options.version) {
    return base;
  }
  return `${base}?v=${encodeURIComponent(options.version)}`;
}

interface ClosePricesFetchInfoOptions {
  version?: string;
}

export function getClosePricesFetchInfo(options: ClosePricesFetchInfoOptions = {}) {
  const version = options.version ?? readClosePricesVersion() ?? String(Date.now());
  return {
    url: getClosePricesUrl({ version }),
    init: { cache: "no-store" as const },
    version,
  } as const;
}
