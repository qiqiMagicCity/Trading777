export type BreakdownRow = {
  symbol: string;
  time: string;
  action: 'SELL' | 'COVER';
  into: 'M4' | 'M5.1' | 'M5.2';
  qty: number;
  openPrice?: number;
  fifoCost?: number;
  closePrice: number;
  lotTag: 'T' | 'H';
  lotDateStr: string;
  from: 'history' | 'today';
  isToday: boolean;
  pnl_raw: number;
  pnl: number;
  fillId: string;
};

export type BreakdownCollection = {
  all: BreakdownRow[];
  m4: BreakdownRow[];
  m5_1: BreakdownRow[];
  m5_2: BreakdownRow[];
};

export interface PeriodDegradedMap {
  wtd: boolean;
  mtd: boolean;
  ytd: boolean;
}

export type PeriodWindowKey = "wtd" | "mtd" | "ytd";

export type PeriodBaselineMode = "priced" | "partial" | "missing";

export type PeriodWindowStatus =
  | "ok"
  | "partial"
  | "missing"
  | "degraded";

import type { SnapshotFieldParseError } from "../snapshotNumber";

export type PeriodDegradationReason =
  | "DEGEN_NO_BASELINE"
  | "DEGEN_STALE_BASELINE"
  | "DEGEN_WINDOW_EMPTY"
  | "DEGEN_PARSE_FAILED";

export type PeriodParseError = SnapshotFieldParseError;

export interface PeriodBaselineMeta {
  baselineYmd?: string;
  distanceBusinessDays?: number;
  thresholdBusinessDays?: number;
}

export interface PeriodWindowDiagnostics {
  status: PeriodWindowStatus;
  degraded: boolean;
  reason?: PeriodDegradationReason;
  baselineMeta?: PeriodBaselineMeta;
  parseErrors?: PeriodParseError[];
  sameDayDuplicates?: number;
  uiTradeDayYmd?: string;
  periodEvalYmd?: string;
  filteredRowsCount?: number;
  lastSnapshotYmd?: string;
  windowStartYmd?: string;
  officialClose?: PeriodWindowOfficialCloseDiagnostics;
  degradeReasons?: PeriodWindowDegradeReason[];
  mode?: "close" | "live" | "degraded";
  isComplete?: boolean;
  missingPairs?: PeriodMissingPair[];
}

export interface PeriodMissingPair {
  date: string;
  symbol: string;
  impact?: string[];
}

export interface PeriodOfficialCloseSymbolImpact {
  symbol: string;
  purposes: string[];
  impact: string[];
  hasFallback: boolean;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
}

export interface PeriodOfficialCloseDateImpact {
  date: string;
  symbols: PeriodOfficialCloseSymbolImpact[];
}

export interface PeriodWindowOfficialCloseDiagnostics {
  missing: PeriodOfficialCloseDateImpact[];
  pending: PeriodOfficialCloseDateImpact[];
}

export interface PeriodWindowDegradeReason {
  kind: "missing_official_close";
  entries: PeriodOfficialCloseDateImpact[];
}

export interface PeriodWindowBreakdown {
  realized: number;
  unrealizedDelta?: number;
  baselineDate?: string;
  baselineMode: PeriodBaselineMode;
  missingBaselineSymbols?: string[];
}

export interface MissingOfficialCloseEntry {
  symbol: string;
  date: string;
  purposes: string[];
  impact: string[];
  hasFallback: boolean;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
  sources?: import("@/app/lib/diagnostics/reportMissingOfficialClose").MissingOfficialCloseSourceInfo;
}

export interface M4TodayDetail {
  total: number;
  realized: number;
  mtmOvernight: number;
  mtmIntradayOpen: number;
  degraded: boolean;
  reason?: "missing_official_close_prev";
}

export type M1toM3PriceStatus = "live" | "stale";

export interface M1toM3Meta {
  priceStatus: M1toM3PriceStatus;
  lastPriceAtNY: string | null;
  staleSymbols?: string[];
}

export interface M3Value {
  dir: number;
  nominal: number;
}

export interface M123Snapshot {
  m1: number;
  m2: number;
  m3: M3Value;
  meta: M1toM3Meta;
}

export interface MetricsContract {
  M1: number;
  M2: number;
  M3: M3Value;
  /**
   * 今天历史平仓盈利（M4）：runAll 覆盖后的最终数值，来源于历史腿 pnl_raw 求和后 round2。
   */
  M4: number;
  M4_today?: M4TodayDetail;
  M5: { behavior: number; fifo: number };
  M6: { total: number };
  _m6?: {
    realizedToday: number;
    mtmOvernight: number;
    mtmIntradayOpen: number;
    warnings: string[];
  };
  _period?: {
    degraded: PeriodDegradedMap;
    status?: Record<PeriodWindowKey, PeriodWindowStatus>;
    breakdown?: Record<PeriodWindowKey, PeriodWindowBreakdown>;
    firstActiveDate?: string;
    diagnostics?: Record<PeriodWindowKey, PeriodWindowDiagnostics>;
  };
  M7?: any; M8?: any; M9?: number; M10?: any; M11?: any; M12?: any; M13?: any;
  M123?: M123Snapshot;
  /**
   * @deprecated 兼容旧版：沿用原 M3 数值（名义值）。
   */
  M3Legacy?: number;
  aux?: {
    breakdown?: BreakdownCollection;
    m6PriceChange?: number;
    /** 截至昨收的累计已实现盈亏 */
    m6PrevRealizedTotal?: number;
    /** 今日 FIFO 已实现盈亏（与 M5.fifo 一致，便于拆解展示） */
    m6FifoToday?: number;
    realized?: {
      today_intraday: number;
      today_total: number;
    };
    /** M6 逐标的 MTM 拆解 */
    m6Legs?: Array<{
      symbol: string;
      qty: number;
      basis: number;
      mark: number;
      amount: number;
      component?:
        | "realized_today"
        | "mtm_overnight"
        | "mtm_intraday_open";
      direction?: "long" | "short";
    }>;
    /** 因行情缺失等原因未计入 MTM 的标的 */
    m6Excluded?: Array<{
      symbol: string;
      reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
    }>;
    missingPrevCloseSymbols?: string[];
  };
  diagnostics?: {
    missingOfficialCloses?: MissingOfficialCloseEntry[];
    pendingOfficialCloses?: MissingOfficialCloseEntry[];
  };
}

/**
 * 概览接口（直接对应后端 summary 对象）。
 * - M6 等字段沿用后端命名，不在前端重命名/复算；
 * - tradingDateStr 表示当前交易日（按纽约日历日划分）。
 */
export interface SummaryMetrics {
  M1?: number;
  M2?: number;
  M3?: number | M3Value;
  M4?: number;
  M4_today?: M4TodayDetail;
  M5_2?: number; // 今日未平日内（FIFO 未实现）
  M6?: number;   // 今日总盈亏（后端已按规则计算）
  M7?: number;
  M123?: M123Snapshot;
  // 兼容字段：仅为过渡期脚本使用，计划后续移除
  M3Legacy?: number;
  _m6?: {
    realizedToday: number;
    mtmOvernight: number;
    mtmIntradayOpen: number;
    warnings: string[];
  };
  tradingDateStr?: string;
}
