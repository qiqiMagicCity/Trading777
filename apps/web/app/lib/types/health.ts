import type { MissingCloseFallback } from "@/app/lib/dailyResults";

export interface MissingCloseSymbolDetail {
  symbol: string;
  fallbacks: MissingCloseFallback[];
}

export interface MissingCloseSummary {
  date: string;
  symbols: MissingCloseSymbolDetail[];
}

export type PeriodHealthStatus = "ok" | "missing" | "ignored";

export interface PeriodHealth {
  status: PeriodHealthStatus;
  summaries: MissingCloseSummary[];
}
