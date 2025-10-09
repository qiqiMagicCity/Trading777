const VERSION_STORAGE_KEY = "close_prices_version";
const VERSION_META_STORAGE_KEY = "close_prices_version_meta";

export type ClosePricesVersionReason = "fetch" | "import" | "writeback";

export interface ClosePricesVersionMeta {
  version: string;
  reason: ClosePricesVersionReason;
  updatedAt: number;
}

export type ClosePricesVersionEventDetail = ClosePricesVersionMeta;

export const CLOSE_PRICES_VERSION_EVENT = "closePricesVersionChanged" as const;

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window?.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

function safeParseMeta(raw: string | null): ClosePricesVersionMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ClosePricesVersionMeta;
    if (
      parsed &&
      typeof parsed.version === "string" &&
      typeof parsed.reason === "string" &&
      typeof parsed.updatedAt === "number"
    ) {
      return parsed;
    }
  } catch {
    // swallow JSON errors
  }
  return null;
}

export function readClosePricesVersion(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(VERSION_STORAGE_KEY);
}

export function readClosePricesVersionMeta(): ClosePricesVersionMeta | null {
  const storage = getStorage();
  if (!storage) return null;
  return safeParseMeta(storage.getItem(VERSION_META_STORAGE_KEY));
}

export function writeClosePricesVersion(
  version: string,
  reason: ClosePricesVersionReason,
): void {
  const storage = getStorage();
  if (!storage) return;
  const meta: ClosePricesVersionMeta = {
    version,
    reason,
    updatedAt: Date.now(),
  };
  try {
    storage.setItem(VERSION_STORAGE_KEY, version);
    storage.setItem(VERSION_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore write errors
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(
        new CustomEvent<ClosePricesVersionEventDetail>(CLOSE_PRICES_VERSION_EVENT, {
          detail: meta,
        }),
      );
    } catch {
      // ignore dispatch errors
    }
  }
}

export function clearClosePricesVersionForTests(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(VERSION_STORAGE_KEY);
    storage.removeItem(VERSION_META_STORAGE_KEY);
  } catch {
    // ignore cleanup errors
  }
}

export { VERSION_STORAGE_KEY as CLOSE_PRICES_VERSION_KEY };
export { VERSION_META_STORAGE_KEY as CLOSE_PRICES_VERSION_META_KEY };
