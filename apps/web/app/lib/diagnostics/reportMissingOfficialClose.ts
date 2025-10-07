import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

export type MissingOfficialClosePurpose =
  | "M6"
  | "generateDailyResults"
  | "PositionsTable"
  | "runAll"
  | string;

const IMPACT_MAP: Record<string, string[]> = {
  M6: ["M6过夜桶=0", "M4今日退化（过夜=0）"],
  PositionsTable: ["持仓过夜桶=0"],
  generateDailyResults: ["当日未实现盈亏估值基于兜底"],
  runAll: ["WTD/MTD/YTD端点浮盈可能失真"],
};

export interface MissingOfficialCloseDiagnostics {
  missingOfficialCloses: MissingOfficialCloseEntry[];
  pendingOfficialCloses: MissingOfficialCloseEntry[];
}

export function createMissingOfficialCloseDiagnostics(): MissingOfficialCloseDiagnostics {
  return { missingOfficialCloses: [], pendingOfficialCloses: [] };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function uniqueMerge(target: string[], values: string[]): string[] {
  const set = new Set(target);
  for (const value of values) {
    if (!value) continue;
    set.add(value);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function reportMissingOfficialClose(
  diagnostics: MissingOfficialCloseDiagnostics,
  payload: {
    symbol: string;
    date: string;
    purpose: MissingOfficialClosePurpose;
    hasFallback?: boolean;
    status?: "pending" | "missing";
  },
): void {
  if (!diagnostics) return;
  const symbol = normalizeSymbol(payload.symbol ?? "");
  const date = (payload.date ?? "").slice(0, 10);
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const impact = IMPACT_MAP[payload.purpose] ?? [];

  const bucketKey = payload.status === "pending"
    ? "pendingOfficialCloses"
    : "missingOfficialCloses";
  const list = diagnostics[bucketKey];

  if (!Array.isArray(list)) {
    diagnostics[bucketKey] = [];
  }
  const target = diagnostics[bucketKey];

  const detectedAt = new Date().toISOString();

  const existing = target.find(
    (entry) => entry.symbol === symbol && entry.date === date,
  );

  if (existing) {
    existing.purposes = uniqueMerge(existing.purposes, [payload.purpose]);
    existing.impact = uniqueMerge(existing.impact, impact);
    existing.hasFallback = existing.hasFallback || Boolean(payload.hasFallback);
    if (!existing.firstDetectedAt) {
      existing.firstDetectedAt = detectedAt;
    }
    existing.lastDetectedAt = detectedAt;
    return;
  }

  target.push({
    symbol,
    date,
    purposes: uniqueMerge([], [payload.purpose]),
    impact: uniqueMerge([], impact),
    hasFallback: Boolean(payload.hasFallback),
    firstDetectedAt: detectedAt,
    lastDetectedAt: detectedAt,
  });

  target.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.symbol.localeCompare(b.symbol);
  });
}
