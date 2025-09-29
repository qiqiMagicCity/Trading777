import type { MissingCloseFallback } from "@/app/lib/dailyResults";

export interface MissingCloseSymbolDetail {
  symbol: string;
  fallbacks: MissingCloseFallback[];
}

export interface MissingCloseSummary {
  date: string;
  symbols: MissingCloseSymbolDetail[];
}

export type PeriodHealthStatus = "ok" | "missing" | "ignored" | "degraded";

export interface PeriodDegradedState {
  wtd: boolean;
  mtd: boolean;
  ytd: boolean;
}

export interface PeriodHealth {
  status: PeriodHealthStatus;
  summaries: MissingCloseSummary[];
  degraded?: PeriodDegradedState;
}
