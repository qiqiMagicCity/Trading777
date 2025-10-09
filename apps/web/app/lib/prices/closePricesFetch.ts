import { readClosePricesVersion } from "@/app/lib/prices/closePricesVersion";

interface ClosePricesUrlOptions {
  version?: string;
}

interface ClosePricesFetchInfoOptions {
  version?: string;
}

function pickFirst(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (normalized === "undefined" || normalized === "null") continue;
      return trimmed;
    }
  }
  return null;
}

function normalizeAssetPrefix(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "/") return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed.replace(/\/+$/, "");
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeBasePath(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return null;
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  if (!withoutTrailing) return null;
  return withoutTrailing.startsWith("/")
    ? withoutTrailing
    : `/${withoutTrailing}`;
}

function resolveAssetPrefix(): string | null {
  const fromEnv = pickFirst([
    process.env.NEXT_PUBLIC_ASSET_PREFIX,
    process.env.ASSET_PREFIX,
  ]);
  if (fromEnv) {
    return normalizeAssetPrefix(fromEnv);
  }
  if (typeof window !== "undefined") {
    const win = window as typeof window & {
      __NEXT_DATA__?: { assetPrefix?: string | null };
    };
    const runtime = pickFirst([win.__NEXT_DATA__?.assetPrefix ?? null]);
    if (runtime) {
      return normalizeAssetPrefix(runtime);
    }
  } else {
    const runtime = pickFirst([process.env.__NEXT_ASSET_PREFIX]);
    if (runtime) {
      return normalizeAssetPrefix(runtime);
    }
  }
  return null;
}

function resolveBasePath(): string | null {
  const fromEnv = pickFirst([
    process.env.NEXT_PUBLIC_BASE_PATH,
    process.env.BASE_PATH,
  ]);
  if (fromEnv) {
    return normalizeBasePath(fromEnv);
  }
  if (typeof window !== "undefined") {
    const win = window as typeof window & { __NEXT_ROUTER_BASEPATH?: string | null };
    const runtime = pickFirst([win.__NEXT_ROUTER_BASEPATH ?? null]);
    if (runtime) {
      return normalizeBasePath(runtime);
    }
  } else {
    const runtime = pickFirst([process.env.__NEXT_ROUTER_BASEPATH]);
    if (runtime) {
      return normalizeBasePath(runtime);
    }
  }
  return null;
}

export function joinUrlParts(
  ...parts: Array<string | null | undefined>
): string {
  const filtered = parts
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim());
  if (filtered.length === 0) {
    return "";
  }
  const [first, ...rest] = filtered as [string, ...string[]];
  if (/^https?:\/\//i.test(first) || first.startsWith("//")) {
    const base = first.replace(/\/+$/, "");
    const tail = rest
      .map((segment) => segment.replace(/^\/+/, "").replace(/\/+$/, ""))
      .filter(Boolean)
      .join("/");
    return tail ? `${base}/${tail}` : base;
  }
  const segments: string[] = [];
  filtered.forEach((segment, index) => {
    if (!segment) return;
    let value = segment.replace(/\/+/g, "/");
    if (index === 0 && !value.startsWith("/")) {
      value = `/${value}`;
    }
    if (index > 0) {
      value = value.replace(/^\/+/, "");
    }
    if (index < filtered.length - 1) {
      value = value.replace(/\/+$/, "");
    }
    segments.push(value);
  });
  const joined = segments.join("/");
  return joined.replace(/\/{2,}/g, "/");
}

function resolveVersion(explicit?: string | null): string {
  const candidates = [explicit, readClosePricesVersion(), String(Date.now())];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return String(Date.now());
}

export function getClosePricesUrl(options: ClosePricesUrlOptions = {}): string {
  const assetPrefix = resolveAssetPrefix();
  const basePath = resolveBasePath();
  const version = resolveVersion(options.version ?? null);
  const base =
    joinUrlParts(assetPrefix, basePath, "close_prices.json") || "/close_prices.json";
  return `${base}?v=${encodeURIComponent(version)}`;
}

export function getClosePricesFetchInfo(options: ClosePricesFetchInfoOptions = {}) {
  const version = resolveVersion(options.version ?? null);
  return {
    url: getClosePricesUrl({ version }),
    init: { cache: "no-store" as const },
    version,
  } as const;
}
