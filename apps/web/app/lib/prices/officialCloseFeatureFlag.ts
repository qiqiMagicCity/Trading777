const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    return TRUE_VALUES.has(normalized);
  }
  return false;
}

let cachedServerValue: boolean | null = null;

export function isOfficialCloseFixEnabled(): boolean {
  if (typeof window !== "undefined") {
    const win = window as typeof window & {
      OFFICIAL_CLOSE_FIX_ENABLED?: unknown;
      NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED?: unknown;
    };
    if (win.OFFICIAL_CLOSE_FIX_ENABLED !== undefined) {
      return parseFlag(win.OFFICIAL_CLOSE_FIX_ENABLED);
    }
    if (win.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED !== undefined) {
      return parseFlag(win.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED);
    }
  }

  if (cachedServerValue !== null) {
    return cachedServerValue;
  }

  const envValue =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED ??
        process.env.OFFICIAL_CLOSE_FIX_ENABLED
      : undefined;
  cachedServerValue = parseFlag(envValue);
  return cachedServerValue;
}
