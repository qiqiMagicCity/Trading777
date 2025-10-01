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

export type PeriodHealthOrigin = "missing-close-banner" | "metrics";

export type PeriodHealthIssueKind =
  | "MISSING_SNAPSHOT"
  | "MISSING_BASELINE"
  | "INVALID_RECORD"
  | "PERIOD_VALUE_MISSING"
  | "MISSING_PREV_CLOSE"
  | "M6_WARNING"
  | "SNAPSHOT_VALUE_INVALID";

export interface PeriodHealthIssue {
  kind: PeriodHealthIssueKind;
  message: string;
}

export interface PeriodHealth {
  status: PeriodHealthStatus;
  summaries: MissingCloseSummary[];
  degraded?: PeriodDegradedState;
  origin?: PeriodHealthOrigin;
  issues?: PeriodHealthIssue[];
}
