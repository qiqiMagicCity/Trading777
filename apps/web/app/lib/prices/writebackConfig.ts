export type WritebackMode = "none" | "proxy" | "pr";

const VALID_MODES: WritebackMode[] = ["none", "proxy", "pr"];

const SERVER_WRITEBACK_ENV =
  typeof process !== "undefined"
    ? process.env.WRITEBACK_MODE ?? process.env.NEXT_PUBLIC_WRITEBACK_MODE ?? null
    : null;

export const WRITEBACK_MODE = (SERVER_WRITEBACK_ENV || "none") as WritebackMode;

export const OFFICIAL_CLOSE_FIX_ENABLED =
  String(
    (typeof process !== "undefined"
      ? process.env.OFFICIAL_CLOSE_FIX_ENABLED ??
        process.env.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED ??
        null
      : null) ?? "false",
  )
    .trim()
    .toLowerCase() === "true";

export const NEXT_PUBLIC_BASE_PATH =
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BASE_PATH : undefined) ?? "";

function normalizeMode(value: string | null | undefined): WritebackMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (VALID_MODES.includes(normalized as WritebackMode)) {
    return normalized as WritebackMode;
  }
  return null;
}

export function getWritebackMode(): WritebackMode {
  const candidates: Array<string | null | undefined> = [];
  candidates.push(WRITEBACK_MODE);
  if (typeof process !== "undefined" && typeof process.env !== "undefined") {
    candidates.push(process.env.WRITEBACK_MODE);
    candidates.push(process.env.NEXT_PUBLIC_WRITEBACK_MODE);
  }
  if (typeof window !== "undefined") {
    const win = window as typeof window & { NEXT_PUBLIC_WRITEBACK_MODE?: string };
    candidates.push(win.NEXT_PUBLIC_WRITEBACK_MODE);
  }
  for (const candidate of candidates) {
    const mode = normalizeMode(candidate);
    if (mode) {
      return mode;
    }
  }
  return "none";
}

export function isProxyWritebackEnabled(): boolean {
  return getWritebackMode() === "proxy";
}
