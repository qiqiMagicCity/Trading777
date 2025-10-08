/* WTD/MTD/YTD FIX
- 根因：使用字符串比较过滤 daily，导致当天 ISO 带时区的记录被漏算，WTD/MTD/YTD 偏小或相等。
- 修复：统一用纽约时区的数值比较（startOfDayNY/endOfDayNY），确保包含当天。
- UI：确保 WTD 读取 M11、MTD 读取 M12、YTD 读取 M13，避免三者误绑同一字段。
*/
// === file: apps/web/app/lib/metrics.ts ===
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import type { MissingOfficialCloseEntry } from "./types/metrics";
import {
  nowNY,
  toNY,
  getLatestTradingDayStr,
  endOfDayNY,
} from "@/lib/timezone";
import { nyDateStr, startOfDayNY, startOfWeekNY } from "./time";
import { tsFromYmdAtNoonUTC } from "./nyParse";
import { selectLatestSnapshotsByNyDay } from "./metrics-snapshot-selection";
import {
  parseSnapshotNumber,
  type SnapshotFieldParseError,
  type SnapshotNumericField,
} from "./snapshotNumber";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_ISO_RE =
  /^(\d{4}-\d{2}-\d{2})(?:[T ])?00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})?$/i;

function utcNoonOrInvalid(ymd: string): Date {
  try {
    return new Date(tsFromYmdAtNoonUTC(ymd));
  } catch {
    return new Date(Number.NaN);
  }
}

function formatUtcDay(date: Date): string {
  if (Number.isNaN(date.getTime())) return "NaN-NaN-NaN";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysYmd(ymd: string, n: number): string {
  const date = utcNoonOrInvalid(ymd);
  if (!Number.isNaN(date.getTime())) {
    date.setUTCDate(date.getUTCDate() + n);
  }
  return formatUtcDay(date);
}

function normalizeToNyDay(input: string | number | Date): Date | string | number {
  if (typeof input === "string") {
    if (DATE_ONLY_RE.test(input)) {
      return `${input}T12:00:00Z`;
    }

    const midnightMatch = input.match(MIDNIGHT_ISO_RE);
    if (midnightMatch) {
      const [, datePart] = midnightMatch;
      return `${datePart}T12:00:00Z`;
    }
  }
  return input;
}

function nyDayStr(input: string | number | Date): string {
  const normalized = normalizeToNyDay(input);
  return nyDateStr(normalized);
}

function nyTodayStr(): string {
  return nyDayStr(nowNY());
}
import { calcTodayTradePnL } from "./calcTodayTradePnL";
import type { ClosePriceMap } from "./dailyResults";
import {
  createMissingOfficialCloseDiagnostics,
  type MissingOfficialCloseDiagnostics,
} from "./diagnostics/reportMissingOfficialClose";
import { createM4TodayDetail } from "./m4Today";
import { evaluateCloseWindow, previousTradingDay } from "./marketHours";
import { requireOfficialClose, setOfficialCloseContext } from "./price/requireOfficialClose";
import { overlayCacheToMap } from "./officialCloseOverlayStore";
import { sortTrades } from "./sortTrades";
import type { DailyResult, DailyResultInput } from "./types";
import { sumRealized } from "./metrics-period";
import { calcWinLossLots } from "./metrics-winloss";
import { logger } from "@/lib/logger";
import { round2 as mRound2 } from "./money";
import { sumPeriod as sumPeriodBase, type PeriodTotalsOptions } from "./metrics-periods";
import { round4, add4, sub4, mul4, div4 } from "./precision";
import type {
  MetricsContract,
  M4TodayDetail,
  PeriodDegradedMap,
  SummaryMetrics,
  PeriodWindowBreakdown,
  PeriodWindowKey,
  PeriodWindowStatus,
  PeriodBaselineMode,
  PeriodBaselineMeta,
  PeriodWindowDiagnostics,
  PeriodDegradationReason,
  PeriodOfficialCloseDateImpact,
  PeriodOfficialCloseSymbolImpact,
  PeriodWindowDegradeReason,
  PeriodWindowOfficialCloseDiagnostics,
} from "./types/metrics";
import {
  summarizeMissingOfficialCloses,
  type MissingOfficialDateSummary,
  type MissingOfficialSymbolSummary,
} from "./missingOfficialClose";

const EPSILON = 1e-6;

export const STALE_BASELINE_BDAYS = 5;

const OFFICIAL_PERIOD_IMPACT_TAGS = [
  "M6过夜=0→影响M4",
  "WTD/MTD/YTD端点浮盈可能失真",
] as const;

function appendOfficialPeriodImpacts(source: string[]): string[] {
  const set = new Set(
    source
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  );
  for (const tag of OFFICIAL_PERIOD_IMPACT_TAGS) {
    set.add(tag);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function cloneOfficialSymbol(
  summary: MissingOfficialSymbolSummary,
): PeriodOfficialCloseSymbolImpact {
  return {
    symbol: summary.symbol,
    purposes: [...summary.purposes],
    impact: appendOfficialPeriodImpacts(summary.impact),
    hasFallback: summary.hasFallback,
    ...(summary.firstDetectedAt ? { firstDetectedAt: summary.firstDetectedAt } : {}),
    ...(summary.lastDetectedAt ? { lastDetectedAt: summary.lastDetectedAt } : {}),
  };
}

function mapOfficialSummariesInRange(
  summaries: MissingOfficialDateSummary[],
  start: string,
  end: string,
): PeriodOfficialCloseDateImpact[] {
  return summaries
    .filter((entry) => entry.date >= start && entry.date <= end)
    .map((entry) => ({
      date: entry.date,
      symbols: entry.symbols.map((symbol) => cloneOfficialSymbol(symbol)),
    }));
}

function cloneOfficialDateImpacts(
  entries: PeriodOfficialCloseDateImpact[],
): PeriodOfficialCloseDateImpact[] {
  return entries.map((entry) => ({
    date: entry.date,
    symbols: entry.symbols.map((symbol) => ({
      symbol: symbol.symbol,
      purposes: [...symbol.purposes],
      impact: [...symbol.impact],
      hasFallback: symbol.hasFallback,
      ...(symbol.firstDetectedAt ? { firstDetectedAt: symbol.firstDetectedAt } : {}),
      ...(symbol.lastDetectedAt ? { lastDetectedAt: symbol.lastDetectedAt } : {}),
    })),
  }));
}

function cloneOfficialDiagnostics(
  diagnostics: PeriodWindowOfficialCloseDiagnostics,
): PeriodWindowOfficialCloseDiagnostics {
  return {
    missing: cloneOfficialDateImpacts(diagnostics.missing),
    pending: cloneOfficialDateImpacts(diagnostics.pending),
  };
}

function mergeDegradeReasons(
  existing: PeriodWindowDegradeReason[] | undefined,
  officialMissing: PeriodOfficialCloseDateImpact[],
): PeriodWindowDegradeReason[] {
  const base = existing
    ? existing.map((reason) => ({
        kind: reason.kind,
        entries: cloneOfficialDateImpacts(reason.entries),
      }))
    : [];
  if (!officialMissing.length) {
    return base;
  }
  const officialReason: PeriodWindowDegradeReason = {
    kind: "missing_official_close",
    entries: cloneOfficialDateImpacts(officialMissing),
  };
  const found = base.find((reason) => reason.kind === officialReason.kind);
  if (found) {
    found.entries = officialReason.entries;
  } else {
    base.push(officialReason);
  }
  return base;
}

function buildOfficialDiagnosticsForWindow(
  missingSummaries: MissingOfficialDateSummary[],
  pendingSummaries: MissingOfficialDateSummary[],
  start: string,
  end: string,
): PeriodWindowOfficialCloseDiagnostics {
  return {
    missing: mapOfficialSummariesInRange(missingSummaries, start, end),
    pending: mapOfficialSummariesInRange(pendingSummaries, start, end),
  };
}

function clonePeriodWindowDiagnostics(
  diagnostics?: PeriodWindowDiagnostics,
): PeriodWindowDiagnostics | undefined {
  if (!diagnostics) return undefined;
  const clone: PeriodWindowDiagnostics = {
    status: diagnostics.status,
    degraded: diagnostics.degraded,
    ...(diagnostics.reason ? { reason: diagnostics.reason } : {}),
    ...(diagnostics.baselineMeta
      ? { baselineMeta: { ...diagnostics.baselineMeta } }
      : {}),
    ...(diagnostics.parseErrors
      ? { parseErrors: diagnostics.parseErrors.map((err) => ({ ...err })) }
      : {}),
    ...(diagnostics.sameDayDuplicates
      ? { sameDayDuplicates: diagnostics.sameDayDuplicates }
      : {}),
    ...(diagnostics.uiTradeDayYmd ? { uiTradeDayYmd: diagnostics.uiTradeDayYmd } : {}),
    ...(diagnostics.periodEvalYmd
      ? { periodEvalYmd: diagnostics.periodEvalYmd }
      : {}),
    ...(diagnostics.filteredRowsCount !== undefined
      ? { filteredRowsCount: diagnostics.filteredRowsCount }
      : {}),
    ...(diagnostics.lastSnapshotYmd ? { lastSnapshotYmd: diagnostics.lastSnapshotYmd } : {}),
    ...(diagnostics.windowStartYmd
      ? { windowStartYmd: diagnostics.windowStartYmd }
      : {}),
  };
  return clone;
}

export interface CalcMetricsOptions {
  tradingDateStr?: string;
  periodEvalYmd?: string;
  officialCloseMap?: ClosePriceMap;
  officialCloseOverlayMap?: ClosePriceMap;
}

/** 从后端读取汇总（直读 summary.M6 与 tradingDateStr） */
export async function fetchSummaryMetrics(init?: {
  signal?: AbortSignal;
}): Promise<SummaryMetrics> {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in current environment");
  }
  const response = await fetch("/api/metrics", {
    cache: "no-store",
    signal: init?.signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch /api/metrics: ${response.status}`);
  }
  const json = await response.json();
  const summary = (json?.summary ?? json ?? {}) as Record<string, any>;
  const fallbackM5_2 =
    typeof summary?.M5_2 === "number"
      ? summary.M5_2
      : typeof summary?.M5?.fifo === "number"
      ? summary.M5.fifo
      : undefined;

  const result: SummaryMetrics = {
    M1: typeof summary?.M1 === "number" ? summary.M1 : undefined,
    M2: typeof summary?.M2 === "number" ? summary.M2 : undefined,
    M3: typeof summary?.M3 === "number" ? summary.M3 : undefined,
    M4: typeof summary?.M4 === "number" ? summary.M4 : summary?.M4?.total,
    M5_2: fallbackM5_2,
    M6:
      typeof summary?.M6 === "number"
        ? summary.M6
        : typeof summary?.M6?.total === "number"
        ? summary.M6.total
        : undefined,
    M7: typeof summary?.M7 === "number" ? summary.M7 : summary?.M7?.total,
    _m6:
      summary?._m6 && typeof summary._m6 === "object"
        ? {
            realizedToday: Number(summary._m6.realizedToday) || 0,
            mtmOvernight: Number(summary._m6.mtmOvernight) || 0,
            mtmIntradayOpen: Number(summary._m6.mtmIntradayOpen) || 0,
            warnings: Array.isArray(summary._m6.warnings)
              ? summary._m6.warnings.filter(
                  (msg: unknown): msg is string => typeof msg === "string",
                )
              : [],
          }
        : undefined,
    tradingDateStr:
      typeof summary?.tradingDateStr === "string"
        ? summary.tradingDateStr
        : undefined,
  };
  return result;
}

export function isDebug() {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    (new URLSearchParams(location.search).has("debug") ||
      process.env.NEXT_PUBLIC_DEBUG_METRICS === "1")
  );
}

// Only enable verbose logging outside production
const DEBUG = isDebug();

function seedInitialLots(
  trades: EnrichedTrade[],
  longFifo: Record<string, { qty: number; price: number; date: string }[]>,
  shortFifo: Record<string, { qty: number; price: number; date: string }[]>,
) {
  for (const trade of trades) {
    if (!trade.isInitialPosition) continue;
    const qty = Math.abs(trade.quantity);
    if (qty <= EPSILON) continue;
    const lot = { qty, price: trade.price, date: trade.date };
    if (trade.action === "short") {
      if (!shortFifo[trade.symbol]) shortFifo[trade.symbol] = [];
      shortFifo[trade.symbol]!.push(lot);
    } else {
      if (!longFifo[trade.symbol]) longFifo[trade.symbol] = [];
      longFifo[trade.symbol]!.push(lot);
    }
  }
}

/**
 * 交易系统指标接口
 * 定义了所有需要计算和展示的指标
 */
export interface Metrics {
  M1: number;
  M2: number;
  M3: number;
  /**
   * @deprecated 前端请改读 {@link normalizeMetrics}.M4（与 runAll().result.M4 对齐）。
   * 仅用于兼容旧有调用，避免直接消费 calcMetrics 内部口径。
   */
  M4: number;
  M4_today?: M4TodayDetail;
  M5: {
    trade: number;
    fifo: number;
  };
  M6: number;
  _m6?: {
    realizedToday: number;
    mtmOvernight: number;
    mtmIntradayOpen: number;
    warnings: string[];
  };
  _period?: {
    degraded: PeriodDegradedMap;
    status?: Record<"wtd" | "mtd" | "ytd", PeriodWindowStatus>;
    breakdown?: Record<"wtd" | "mtd" | "ytd", PeriodWindowBreakdown>;
    firstActiveDate?: string;
    diagnostics?: Record<"wtd" | "mtd" | "ytd", PeriodWindowDiagnostics>;
  };
  M7: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };
  M8: {
    B: number;
    S: number;
    P: number;
    C: number;
    total: number;
  };
  M9: number;
  M10: {
    win: number;
    loss: number;
    flat: number;
    rate: number;
  };
  M11: number;
  M12: number;
  M13: number;
  aux?: {
    m6PriceChange?: number;
    m6PrevRealizedTotal?: number;
    m6FifoToday?: number;
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
    }>;
    m6Excluded?: Array<{
      symbol: string;
      reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
    }>;
    missingPrevCloseSymbols?: string[];
  };
  diagnostics?: {
    missingOfficialCloses?: MissingOfficialCloseEntry[];
  };
}

/** 价格映射类型，格式为 { 日期: { 股票代码: 价格 } } */
export type PriceMap = Record<string, Record<string, number>>;

export type RealizedBreakdownRow = {
  time: string;
  symbol: string;
  side: "sell" | "cover";
  into: "M4" | "M5.2";
  qty: number;
  openPrice: number;
  closePrice: number;
  pnl: number;
};

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function reportMonitoring(message: string, details?: unknown): void {
  const url = process.env.NEXT_PUBLIC_MONITOR_URL;
  if (!url || typeof fetch !== "function") return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, details }),
  }).catch((err) => {
    logger.error("reportMonitoring failed", err);
  });
}

function normalizeDateInput(
  input: string | number | Date | undefined,
): string | number | Date | undefined {
  if (typeof input !== "string") return input;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (trimmed.length === 10) return trimmed;
  if (trimmed.includes(" ") && !trimmed.includes("T")) {
    return trimmed.replace(" ", "T");
  }
  return trimmed;
}

function normalizeDateLikeValue(
  value: string | number | Date | undefined,
): string | null {
  const normalized = normalizeDateInput(value);
  if (typeof normalized === "string") {
    const candidate =
      normalized.length === 10 ? `${normalized}T12:00:00Z` : normalized;
    const parsed = toNY(candidate);
    return Number.isNaN(parsed.getTime()) ? null : normalized;
  }
  if (normalized instanceof Date) {
    return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString();
  }
  if (typeof normalized === "number") {
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function resolveTradeDate(
  trade: Pick<EnrichedTrade, "date" | "time">,
): Date | null {
  const normalizedDate = normalizeDateInput(trade?.date);
  const normalizedTime = normalizeDateInput(trade?.time);
  const source =
    normalizedDate !== undefined
      ? normalizedDate
      : normalizedTime !== undefined
      ? normalizedTime
      : undefined;
  if (source === undefined) return null;
  const parsed =
    typeof source === "string" && source.length === 10
      ? toNY(`${source}T12:00:00Z`)
      : toNY(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function assertM6(metrics: Metrics) {
  if (!DEBUG) return;
  const priceChange = metrics.aux?.m6PriceChange;
  const prevRealized = metrics.aux?.m6PrevRealizedTotal;
  if (!Number.isFinite(priceChange) || !Number.isFinite(prevRealized)) return;
  const expected = mRound2(
    (prevRealized as number) + metrics.M5.fifo + (priceChange as number),
  );
  if (metrics.M6 !== expected) {
    const data = {
      M4: metrics.M4,
      fifo: metrics.M5.fifo,
      M6: metrics.M6,
      priceChange,
      prevRealized,
      expected,
      missingPrevCloseSymbols: metrics.aux?.missingPrevCloseSymbols ?? [],
    };
    logger.warn("M6 mismatch", data);
    logger.warn(
      "M6 hint",
      "Check M6_QTY_DIAG_BEFORE/M6_QTY_PUSH logs for qty mismatch vs yesterdayQty",
    );
    reportMonitoring("M6 mismatch", data);
  }
}

/** 严格版 M6 计算：按指定口径拆分过夜 / 当日新开未平 两部分 */
type TodayLots = {
  longQty: number;
  longCost: number;
  shortQty: number;
  shortCost: number;
};

type IntradayOpenedLots = Record<string, { long: number; short: number }>;

type BaselineSeed = Record<string, { long?: number | null; short?: number | null }>;

function _buildTodayLots(
  todayTrades: EnrichedTrade[],
  baselineSeed: BaselineSeed = {},
): { lots: Record<string, TodayLots>; opened: IntradayOpenedLots } {
  // 仅记录“当日新开且仍未平”的剩余 lots（FIFO 消耗）
  const bySym = new Map<
    string,
    {
      long: { qty: number; price: number }[];
      short: { qty: number; price: number }[];
    }
  >();

  const opened: IntradayOpenedLots = {};

  const trackOpened = (sym: string, kind: "long" | "short", qty: number) => {
    if (!(qty > EPSILON)) return;
    const key = sym;
    if (!opened[key]) {
      opened[key] = { long: 0, short: 0 };
    }
    opened[key]![kind] += qty;
  };

  const baseline = new Map<string, { long: number; short: number }>();
  for (const [sym, seed] of Object.entries(baselineSeed)) {
    const long = Math.max(0, Number(seed?.long ?? 0));
    const short = Math.max(0, Number(seed?.short ?? 0));
    if (long > EPSILON || short > EPSILON) {
      baseline.set(sym, { long, short });
    }
  }

  const getBag = (sym: string) => {
    const existing = bySym.get(sym);
    if (existing) return existing;
    const created = {
      long: [] as { qty: number; price: number }[],
      short: [] as { qty: number; price: number }[],
    };
    bySym.set(sym, created);
    return created;
  };

  const getBaseline = (sym: string) => {
    const existing = baseline.get(sym);
    if (existing) return existing;
    const created = { long: 0, short: 0 };
    baseline.set(sym, created);
    return created;
  };

  for (const t of todayTrades) {
    const sym = t.symbol;
    if (!sym) continue;
    const qty = Math.abs(Number(t.quantity));
    if (!Number.isFinite(qty) || qty <= EPSILON) continue;

    const pxRaw = Number(t.price);
    const price = Number.isFinite(pxRaw) ? round4(pxRaw) : NaN;

    if (t.isInitialPosition) {
      const base = getBaseline(sym);
      if (t.action === "short" || t.quantity < 0) {
        base.short += qty;
      } else {
        base.long += qty;
      }
      continue;
    }

    const bag = getBag(sym);
    const base = baseline.get(sym);

    const consumeLots = (
      lots: { qty: number; price: number }[],
      amount: number,
    ) => {
      let remain = amount;
      while (remain > EPSILON && lots.length > 0) {
        const lot = lots[0]!;
        const use = Math.min(lot.qty, remain);
        lot.qty -= use;
        remain -= use;
        if (lot.qty <= EPSILON) {
          lots.shift();
        }
      }
      return remain;
    };

    if (t.action === "buy") {
      if (Number.isFinite(price)) {
        bag.long.push({ qty, price });
        trackOpened(sym, "long", qty);
      }
      continue;
    }

    if (t.action === "short") {
      if (Number.isFinite(price)) {
        bag.short.push({ qty, price });
        trackOpened(sym, "short", qty);
      }
      continue;
    }

    if (t.action === "sell") {
      let remain = consumeLots(bag.long, qty);

      if (remain > EPSILON && base && base.long > EPSILON) {
        const use = Math.min(base.long, remain);
        base.long -= use;
        remain -= use;
        if (base.long <= EPSILON) base.long = 0;
      }

      if (remain > EPSILON && Number.isFinite(price)) {
        bag.short.push({ qty: remain, price });
        trackOpened(sym, "short", remain);
      }
      continue;
    }

    if (t.action === "cover") {
      let remain = consumeLots(bag.short, qty);

      if (remain > EPSILON && base && base.short > EPSILON) {
        const use = Math.min(base.short, remain);
        base.short -= use;
        remain -= use;
        if (base.short <= EPSILON) base.short = 0;
      }

      if (remain > EPSILON && Number.isFinite(price)) {
        bag.long.push({ qty: remain, price });
        trackOpened(sym, "long", remain);
      }
    }
  }

  const result: Record<string, TodayLots> = {};
  for (const [sym, bag] of bySym.entries()) {
    const validLongLots = bag.long.filter((lot) => lot.qty > EPSILON && Number.isFinite(lot.price));
    const validShortLots = bag.short.filter((lot) => lot.qty > EPSILON && Number.isFinite(lot.price));

    const longQty = validLongLots.reduce((acc, lot) => acc + lot.qty, 0);
    const shortQty = validShortLots.reduce((acc, lot) => acc + lot.qty, 0);

    if (longQty <= EPSILON && shortQty <= EPSILON) {
      continue;
    }

    let longCostTotal = 0;
    if (longQty > 0) {
      for (const lot of validLongLots) {
        const lotCost = mul4(lot.price, lot.qty);
        if (Number.isFinite(lotCost)) {
          longCostTotal = add4(longCostTotal, lotCost);
        }
      }
    }

    let shortCostTotal = 0;
    if (shortQty > 0) {
      for (const lot of validShortLots) {
        const lotCost = mul4(lot.price, lot.qty);
        if (Number.isFinite(lotCost)) {
          shortCostTotal = add4(shortCostTotal, lotCost);
        }
      }
    }

    const longCost = longQty > 0 ? div4(longCostTotal, longQty) : 0;
    const shortCost = shortQty > 0 ? div4(shortCostTotal, shortQty) : 0;

    result[sym] = { longQty, longCost, shortQty, shortCost };
  }
  return { lots: result, opened };
}

function _calcM6Strict(params: {
  positions: Position[];
  todayTrades: EnrichedTrade[]; // 仅 todayStr 的交易
  sortedTrades: EnrichedTrade[];
  todayStr: string;
  M4: number;
  M5_2: number; // FIFO 未实现（当日）
  lastPriceFallback?: (symbol: string) => number | null; // 可选：没有行情时从当日成交价取
}) {
  const {
    positions,
    todayTrades,
    sortedTrades,
    todayStr,
    M4,
    M5_2,
    lastPriceFallback,
  } = params;

  const realizedRows = debugTodayRealizedBreakdown(sortedTrades, todayStr);
  let realizedToday = 0;

  const legs: Array<{
    symbol: string;
    qty: number;
    basis: number;
    mark: number;
    amount: number;
    component: "realized_today" | "mtm_overnight" | "mtm_intraday_open";
    direction?: "long" | "short";
  }> = [];

  for (const row of realizedRows.rows) {
    const amount = row.pnl;
    realizedToday += amount;
    legs.push({
      symbol: row.symbol,
      qty: row.qty,
      basis: row.openPrice,
      mark: row.closePrice,
      amount,
      component: "realized_today",
      direction: row.side === "sell" ? "long" : "short",
    });
  }

  // 2) 做一个 Position 索引
  const posMap = new Map<string, Position>();
  for (const p of positions) if (p?.symbol) posMap.set(p.symbol, p);

  // 1) 当日新开且仍未平的 lots（按 FIFO 剩余）
  const tradeSymbols = new Set<string>();
  const deltaBySymbol = new Map<string, number>();
  for (const t of todayTrades) {
    const sym = t.symbol;
    if (!sym) continue;
    tradeSymbols.add(sym);
    const qty = Math.abs(Number(t.quantity));
    if (!Number.isFinite(qty) || qty <= EPSILON) continue;
    let delta = 0;
    switch (t.action) {
      case "buy":
      case "cover":
        delta = qty;
        break;
      case "sell":
      case "short":
        delta = -qty;
        break;
      default:
        break;
    }
    if (delta !== 0) {
      deltaBySymbol.set(sym, (deltaBySymbol.get(sym) ?? 0) + delta);
    }
  }

  const baselineSeed: BaselineSeed = {};
  for (const sym of tradeSymbols) {
    const currentQtyRaw = Number(posMap.get(sym)?.qty ?? 0);
    const currentQty = Number.isFinite(currentQtyRaw) ? currentQtyRaw : 0;
    const delta = deltaBySymbol.get(sym) ?? 0;
    const startQty = currentQty - delta;
    if (Math.abs(startQty) > EPSILON) {
      if (startQty > 0) baselineSeed[sym] = { long: Math.abs(startQty) };
      else baselineSeed[sym] = { short: Math.abs(startQty) };
    }
  }

  const { lots: todayLots, opened: intradayOpenedLots } = _buildTodayLots(
    todayTrades,
    baselineSeed,
  );

  let mtmOvernight = 0;
  let mtmIntradayOpen = 0;
  const warnings: string[] = [];
  const missingPrevCloseSymbols = new Set<string>();
  const prevCloseDate = previousTradingDay(todayStr);
  const prevCloseCache = new Map<
    string,
    ReturnType<typeof requireOfficialClose>
  >();

  const normalizedSymbol = (value: string) => value.trim().toUpperCase();

  const intradayRealizedBySymbol = new Map<
    string,
    { long: number; short: number }
  >();

  for (const row of realizedRows.rows) {
    if (row.into !== "M5.2") continue;
    const key = normalizedSymbol(row.symbol);
    if (!key) continue;
    const bucket =
      intradayRealizedBySymbol.get(key) ?? { long: 0, short: 0 };
    if (row.side === "sell") {
      bucket.long += row.qty;
    } else if (row.side === "cover") {
      bucket.short += row.qty;
    }
    intradayRealizedBySymbol.set(key, bucket);
  }

  const requestOfficialPrevClose = (symbol: string) => {
    const key = normalizedSymbol(symbol);
    if (!key) {
      const missing: { ok: false; reason: "no_official_close" } = {
        ok: false,
        reason: "no_official_close",
      };
      return missing;
    }
    const cached = prevCloseCache.get(key);
    if (cached) return cached;
    if (!prevCloseDate) {
      const missing: { ok: false; reason: "no_official_close" } = {
        ok: false,
        reason: "no_official_close",
      };
      prevCloseCache.set(key, missing);
      return missing;
    }
    const result = requireOfficialClose(key, prevCloseDate, "M6");
    prevCloseCache.set(key, result);
    return result;
  };

  const invariantSymbols = new Set<string>([
    ...Object.keys(todayLots),
    ...Object.keys(intradayOpenedLots),
    ...intradayRealizedBySymbol.keys(),
  ]);

  for (const symbol of invariantSymbols) {
    const opened = intradayOpenedLots[symbol] ?? { long: 0, short: 0 };
    const realized = intradayRealizedBySymbol.get(symbol) ?? {
      long: 0,
      short: 0,
    };
    const remain = todayLots[symbol] ?? {
      longQty: 0,
      longCost: 0,
      shortQty: 0,
      shortCost: 0,
    };
    const longGap = Math.abs(opened.long - (realized.long + remain.longQty));
    const shortGap = Math.abs(opened.short - (realized.short + remain.shortQty));
    if (longGap > 1e-6 || shortGap > 1e-6) {
      throw new Error(
        `M6 intraday lot invariant violated for ${symbol}: opened(${opened.long.toFixed(
          6,
        )}/${opened.short.toFixed(6)}) ≠ realized(${realized.long.toFixed(
          6,
        )}/${realized.short.toFixed(6)}) + remain(${remain.longQty.toFixed(
          6,
        )}/${remain.shortQty.toFixed(6)})`,
      );
    }
  }

  for (const [symbol, lots] of Object.entries(todayLots)) {
    const pos = posMap.get(symbol);
    const currentQty = Number(pos?.qty ?? 0); // 净数量（可为负）
    if (!Number.isFinite(currentQty) || Math.abs(currentQty) < 1e-9) continue;

    // 2.1 实时价与昨收
    let mark = Number(pos?.last);
    if (!Number.isFinite(mark) && typeof lastPriceFallback === "function") {
      const v = lastPriceFallback(symbol);
      if (Number.isFinite(Number(v))) mark = Number(v);
    }
    const hasMark = Number.isFinite(mark);
    const markRounded = hasMark ? round4(mark) : NaN;
    let prevCloseRounded = NaN;
    let hasPrev = false;

    // 2.2 当日新开仍未平的净数量（多为正、空为负）
    const todayLongQty = Number(lots.longQty ?? 0);
    const todayShortQty = Number(lots.shortQty ?? 0);
    const todayLongOpen = Math.abs(todayLongQty) > EPSILON ? todayLongQty : 0;
    const todayShortOpen = Math.abs(todayShortQty) > EPSILON ? todayShortQty : 0;

    const todayNewSignedRaw = todayLongOpen - todayShortOpen;
    const todayNewSigned =
      Math.abs(todayNewSignedRaw) > EPSILON ? todayNewSignedRaw : 0;

    // 2.3 过夜净数量 = 当前净仓 − 今日新开仍未平净仓
    const overnightSignedRaw = currentQty - todayNewSigned;
    const overnightSigned =
      Math.abs(overnightSignedRaw) > EPSILON ? overnightSignedRaw : 0;

    const recordLeg = (
      component: "mtm_overnight" | "mtm_intraday_open",
      qty: number,
      basis: number,
      pnl: number,
      direction: "long" | "short",
    ) => {
      const roundedBasis = round4(basis);
      const roundedAmount = round4(pnl);
      const roundedMark = Number.isFinite(markRounded) ? markRounded : NaN;
      legs.push({
        symbol,
        qty,
        basis: roundedBasis,
        mark: roundedMark,
        amount: roundedAmount,
        component,
        direction,
      });
      if (component === "mtm_overnight") {
        mtmOvernight = add4(mtmOvernight, roundedAmount);
      } else {
        mtmIntradayOpen = add4(mtmIntradayOpen, roundedAmount);
      }
    };

    // === 当日新开未平部分 ===
    if (hasMark) {
      if (todayLongOpen > EPSILON) {
        const basisRaw = Number(lots.longCost ?? NaN);
        if (Number.isFinite(basisRaw)) {
          const basis = round4(basisRaw);
          const diff = sub4(markRounded, basis);
          const pnl = mul4(diff, todayLongOpen);
          if (Number.isFinite(pnl)) {
            recordLeg("mtm_intraday_open", todayLongOpen, basis, pnl, "long");
          }
        } else {
          warnings.push(`SafePrice: ${symbol} 缺少当日多头成本，当日新开未平不计入。`);
        }
      }
      if (todayShortOpen > EPSILON) {
        const basisRaw = Number(lots.shortCost ?? NaN);
        if (Number.isFinite(basisRaw)) {
          const basis = round4(basisRaw);
          const diff = sub4(basis, markRounded);
          const pnl = mul4(diff, todayShortOpen);
          if (Number.isFinite(pnl)) {
            recordLeg("mtm_intraday_open", todayShortOpen, basis, pnl, "short");
          }
        } else {
          warnings.push(`SafePrice: ${symbol} 缺少当日空头成本，当日新开未平不计入。`);
        }
      }
    } else {
      warnings.push(`SafePrice: ${symbol} 缺少实时价，当日新开未平不计入。`);
    }

    // === 过夜部分 ===
    if (Math.abs(overnightSigned) > 1e-9) {
      const prevResult = requestOfficialPrevClose(symbol);
      if (prevResult.ok) {
        hasPrev = true;
        prevCloseRounded = round4(prevResult.price);
      } else {
        missingPrevCloseSymbols.add(normalizedSymbol(symbol));
      }
      if (hasMark && hasPrev) {
        if (overnightSigned > 0) {
          const diff = sub4(markRounded, prevCloseRounded);
          const pnl = mul4(diff, overnightSigned);
          if (Number.isFinite(pnl)) {
            recordLeg(
              "mtm_overnight",
              overnightSigned,
              prevCloseRounded,
              pnl,
              "long",
            );
          }
        } else {
          const absQty = Math.abs(overnightSigned);
          const diff = sub4(prevCloseRounded, markRounded);
          const pnl = mul4(diff, absQty);
          if (Number.isFinite(pnl)) {
            recordLeg(
              "mtm_overnight",
              absQty,
              prevCloseRounded,
              pnl,
              "short",
            );
          }
        }
      } else {
        const miss: string[] = [];
        if (!hasMark) miss.push("实时价");
        if (!hasPrev) miss.push("昨收价");
        warnings.push(`SafePrice: ${symbol} 缺少${miss.join("与")}，过夜部分按 0 计入。`);
      }
    }
  }

  // 3) 还需考虑那些“今天没有任何交易但有持仓”的标的（全部算作过夜）
  for (const p of positions) {
    const symbol = p.symbol;
    if (!symbol || todayLots[symbol]) continue; // 已处理
    const currentQty = Number(p.qty ?? 0);
    if (!Number.isFinite(currentQty) || Math.abs(currentQty) < 1e-9) continue;

    let mark = Number(p.last);
    if (!Number.isFinite(mark) && typeof lastPriceFallback === "function") {
      const v = lastPriceFallback(symbol);
      if (Number.isFinite(Number(v))) mark = Number(v);
    }
    const hasMark = Number.isFinite(mark);
    const markRounded = hasMark ? round4(mark) : NaN;
    const prevResult = requestOfficialPrevClose(symbol);
    let prevCloseRounded = NaN;
    let hasPrev = false;
    if (prevResult.ok) {
      hasPrev = true;
      prevCloseRounded = round4(prevResult.price);
    } else {
      missingPrevCloseSymbols.add(normalizedSymbol(symbol));
    }

    if (hasMark && hasPrev) {
      if (currentQty > 0) {
        const diff = sub4(markRounded, prevCloseRounded);
        const pnl = mul4(diff, currentQty);
        if (Number.isFinite(pnl)) {
          const amount = round4(pnl);
          legs.push({
            symbol,
            qty: currentQty,
            basis: prevCloseRounded,
            mark: markRounded,
            amount,
            component: "mtm_overnight",
            direction: "long",
          });
          mtmOvernight = add4(mtmOvernight, amount);
        }
      } else {
        const absQty = Math.abs(currentQty);
        const diff = sub4(prevCloseRounded, markRounded);
        const pnl = mul4(diff, absQty);
        if (Number.isFinite(pnl)) {
          const amount = round4(pnl);
          legs.push({
            symbol,
            qty: absQty,
            basis: prevCloseRounded,
            mark: markRounded,
            amount,
            component: "mtm_overnight",
            direction: "short",
          });
          mtmOvernight = add4(mtmOvernight, amount);
        }
      }
    } else {
      const miss: string[] = [];
      if (!hasMark) miss.push("实时价");
      if (!hasPrev) miss.push("昨收价");
      warnings.push(`SafePrice: ${symbol} 缺少${miss.join("与")}，过夜部分按 0 计入。`);
    }
  }

  mtmOvernight = round4(mtmOvernight);
  mtmIntradayOpen = round4(mtmIntradayOpen);

  const realizedTotal = M4 + M5_2;
  if (Math.abs(realizedToday - realizedTotal) > 1e-6) {
    warnings.push(
      `M6 严格口径：已实现拆解(${realizedToday.toFixed(2)}) 与总计(${realizedTotal.toFixed(
        2,
      )}) 不一致。`,
    );
  }
  const M6 = realizedTotal + mtmOvernight + mtmIntradayOpen;
  return {
    M6,
    realizedToday: realizedTotal,
    mtmOvernight,
    mtmIntradayOpen,
    warnings,
    legs,
    missingPrevCloseSymbols: Array.from(missingPrevCloseSymbols),
  };
}

function _count(list: { action?: string }[] | undefined) {
  const res = { B: 0, S: 0, P: 0, C: 0, total: 0 };
  if (!Array.isArray(list)) return res;
  for (const item of list) {
    switch (item?.action) {
      case "buy":
        res.B++;
        break;
      case "sell":
        res.S++;
        break;
      case "short":
        res.P++;
        break;
      case "cover":
        res.C++;
        break;
    }
  }
  res.total = res.B + res.S + res.P + res.C;
  return res;
}

/** 判断日期字符串是否为今日（纽约时区） */
function isTodayNY(
  dateInput: string | number | Date | undefined,
  todayStr: string,
): boolean {
  if (dateInput === undefined || dateInput === null) return false;
  try {
    const day = nyDayStr(dateInput);
    const today = nyDayStr(`${todayStr}T12:00:00Z`);
    return day === today;
  } catch (error) {
    if (DEBUG) {
      logger.debug("isTodayNY_error", { dateInput, error });
    }
    return false;
  }
}

function isOnOrBeforeNY(
  dateStr: string | undefined,
  todayStr: string,
): boolean {
  if (!dateStr) return true;
  const d = toNY(dateStr);
  const end = toNY(`${todayStr}T23:59:59.999`);
  return !isNaN(d.getTime()) && d.getTime() <= end.getTime();
}

function isValidTradeDate(
  dateStr: string | undefined,
  todayStr: string,
  context: string,
  trade: EnrichedTrade,
): boolean {
  if (!dateStr) {
    console.warn(`${context}: missing trade date`, trade);
    return false;
  }
  const d = toNY(dateStr);
  if (isNaN(d.getTime())) {
    console.warn(`${context}: invalid trade date`, dateStr, trade);
    return false;
  }
  const end = toNY(`${todayStr}T23:59:59.999`);
  if (d.getTime() > end.getTime()) {
    console.warn(`${context}: future trade date`, dateStr, trade);
    return false;
  }
  return true;
}

export function sumPeriod(
  daily: DailyResult[],
  fromStr: string,
  toStr: string,
) {
  return sumPeriodBase(daily, fromStr, toStr);
}

type NormalizedDailyForWindow = {
  day: string;
  realized: number;
  unrealized?: number;
  unrealizedDelta?: number;
  resolvedUnrealized?: number;
  missingBaselineSymbols?: string[];
  parseErrors?: SnapshotFieldParseError[];
  sameDayDuplicateCount?: number;
};

export interface WindowTotalsResult {
  wtd: number;
  mtd: number;
  ytd: number;
  degraded: PeriodDegradedMap;
  firstActiveDate: string;
  breakdown: Record<PeriodWindowKey, PeriodWindowBreakdown>;
  status: Record<PeriodWindowKey, PeriodWindowStatus>;
  diagnostics: Record<PeriodWindowKey, PeriodWindowDiagnostics>;
}

function normalizeDailyRowsForWindow(
  daily: DailyResultInput[] = [],
  endISO: string,
): NormalizedDailyForWindow[] {
  const latest = selectLatestSnapshotsByNyDay(daily, { maxNyDay: endISO });

  return latest.map(({ snapshot, nyDay, duplicates }) => {
    const inheritedErrors = Array.isArray((snapshot as any)?.parseErrors)
      ? ((snapshot as any).parseErrors as SnapshotFieldParseError[])
          .filter((err) => err && typeof err === "object")
          .map((err) => ({ ...err, day: err.day ?? nyDay }))
      : [];

    const parseErrors: SnapshotFieldParseError[] = [...inheritedErrors];

    const parseField = (
      field: SnapshotNumericField,
      value: unknown,
      { optional = false }: { optional?: boolean } = {},
    ): number | undefined => {
      if (optional && (value === null || value === undefined)) {
        return undefined;
      }
      const parsed = parseSnapshotNumber(value);
      if (parsed.ok) {
        return parsed.value;
      }
      parseErrors.push({ ...parsed.error, field, day: nyDay });
      return undefined;
    };

    const realizedValue = parseField("realized", (snapshot as any)?.realized);
    const row: NormalizedDailyForWindow = {
      day: nyDay,
      realized: realizedValue ?? 0,
    };

    if (typeof duplicates === "number" && duplicates > 0) {
      row.sameDayDuplicateCount = duplicates;
    }

    const missingSymbolsSource = (snapshot as any)?.missingBaselineSymbols;
    if (Array.isArray(missingSymbolsSource)) {
      const normalizedSymbols = missingSymbolsSource
        .map((symbol: unknown) =>
          typeof symbol === "string" ? symbol.trim().toUpperCase() : null,
        )
        .filter((symbol): symbol is string => Boolean(symbol));
      if (normalizedSymbols.length > 0) {
        row.missingBaselineSymbols = normalizedSymbols;
      }
    }

    const unrealizedValue = parseField("unrealized", (snapshot as any)?.unrealized);
    if (typeof unrealizedValue === "number") {
      row.unrealized = unrealizedValue;
    }

    const unrealizedDeltaValue = parseField(
      "unrealizedDelta",
      (snapshot as any)?.unrealizedDelta,
      { optional: true },
    );
    if (typeof unrealizedDeltaValue === "number") {
      row.unrealizedDelta = unrealizedDeltaValue;
    }

    if (parseErrors.length > 0) {
      row.parseErrors = parseErrors;
    }

    return row;
  });
}

function resolveUnrealizedForWindow(
  rows: NormalizedDailyForWindow[],
): NormalizedDailyForWindow[] {
  let prev: number | undefined;
  return rows.map((row) => {
    let resolved: number | undefined;
    if (typeof row.unrealized === "number" && Number.isFinite(row.unrealized)) {
      resolved = row.unrealized;
    } else if (
      typeof row.unrealizedDelta === "number" &&
      Number.isFinite(row.unrealizedDelta) &&
      typeof prev === "number"
    ) {
      resolved = prev + row.unrealizedDelta;
    } else if (typeof prev === "number") {
      resolved = prev;
    }

    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      prev = resolved;
      return { ...row, resolvedUnrealized: resolved };
    }

    return { ...row, resolvedUnrealized: undefined };
  });
}

function findRowOnOrBefore(
  rows: NormalizedDailyForWindow[],
  day: string,
): NormalizedDailyForWindow | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (row.day <= day) return row;
  }
  return undefined;
}

function findRowBefore(
  rows: NormalizedDailyForWindow[],
  day: string,
): NormalizedDailyForWindow | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (row.day < day) return row;
  }
  return undefined;
}

function nextTradingDay(day: string): string {
  const date = utcNoonOrInvalid(day);
  if (Number.isNaN(date.getTime())) return day;
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return formatUtcDay(date);
}

function countTradingDaysBetween(
  startDay: string,
  endDay: string,
): number | undefined {
  if (!startDay || !endDay) return undefined;
  if (startDay >= endDay) return 0;
  const start = utcNoonOrInvalid(startDay);
  const end = utcNoonOrInvalid(endDay);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined;
  let cursor = startDay;
  let count = 0;
  let guard = 0;
  const LIMIT = 4096;
  while (cursor < endDay && guard < LIMIT) {
    const next = nextTradingDay(cursor);
    if (next === cursor) break;
    guard += 1;
    if (next >= endDay) {
      if (next === endDay) count += 1;
      break;
    }
    count += 1;
    cursor = next;
  }
  return count;
}

function firstMondayOfYear(yearStart: string): string {
  const jan1 = toNY(`${yearStart}T12:00:00Z`);
  const offset = (8 - jan1.getDay()) % 7;
  return addDaysYmd(yearStart, offset);
}

function weekStartForEvalDay(evalDay: string): string {
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;
  const firstMonday = firstMondayOfYear(yearStart);
  if (evalDay < firstMonday) {
    return yearStart;
  }
  const monday = nyDateStr(startOfWeekNY(`${evalDay}T12:00:00Z`));
  return monday < firstMonday ? firstMonday : monday;
}

function sumRealizedBetween(
  rows: NormalizedDailyForWindow[],
  start: string,
  end: string,
): { total: number; hasParseFailure: boolean } {
  let total = 0;
  let hasParseFailure = false;
  for (const row of rows) {
    if (row.day < start) continue;
    if (row.day > end) break;
    if (row.parseErrors?.some((err) => err.field === "realized")) {
      hasParseFailure = true;
    }
    total += row.realized;
  }
  return { total, hasParseFailure };
}

type WindowTotalsOptions = PeriodTotalsOptions & {
  firstActiveDate?: string;
  uiTradeDayYmd?: string;
};

function deriveWindowTotals(
  rowsInput: NormalizedDailyForWindow[],
  evalDay: string,
  options: WindowTotalsOptions,
): WindowTotalsResult {
  const rows = resolveUnrealizedForWindow(rowsInput);
  const endRow = findRowOnOrBefore(rows, evalDay);
  const uiTradeDayYmd = (() => {
    const raw = options.uiTradeDayYmd;
    if (!raw) return evalDay;
    try {
      return nyDayStr(raw);
    } catch {
      return evalDay;
    }
  })();
  const filteredRowsCount = rows.reduce(
    (count, row) => (row.day <= evalDay ? count + 1 : count),
    0,
  );
  const lastSnapshotYmd = endRow?.day;
  const firstActiveCandidate = (() => {
    const raw = options.firstActiveDate?.trim();
    if (raw) return nyDayStr(raw);
    return rows[0]?.day;
  })();
  const firstActive = firstActiveCandidate || evalDay;

  const computeWindow = (windowStart: string) => {
    const {
      total: realized,
      hasParseFailure: realizedParseFailure,
    } = sumRealizedBetween(rows, windowStart, evalDay);
    const baselineCandidate = findRowBefore(rows, windowStart);
    let baselineRow =
      baselineCandidate && baselineCandidate.day >= firstActive
        ? baselineCandidate
        : undefined;

    const baselineDistance = baselineCandidate
      ? countTradingDaysBetween(baselineCandidate.day, windowStart)
      : undefined;

    const baselineMeta: PeriodBaselineMeta | undefined = baselineCandidate
      ? {
          baselineYmd: baselineCandidate.day,
          ...(typeof baselineDistance === "number"
            ? { distanceBusinessDays: baselineDistance }
            : {}),
        }
      : undefined;

    let baselineMode: PeriodBaselineMode = "missing";
    let baselineDate: string | undefined = baselineCandidate?.day;
    let missingBaselineSymbols: string[] | undefined;
    let baselineValue: number | undefined;
    let degradeReason: PeriodDegradationReason | undefined;
    const windowParseErrors: SnapshotFieldParseError[] = [];
    let sameDayDuplicates = 0;

    for (const row of rows) {
      if (row.day < windowStart || row.day > evalDay) continue;
      if (row.parseErrors?.length) {
        windowParseErrors.push(
          ...row.parseErrors.map((err) => ({ ...err })),
        );
      }
      if (row.sameDayDuplicateCount) {
        sameDayDuplicates += row.sameDayDuplicateCount;
      }
    }

    if (!baselineRow) {
      const fallbackRow = rows.find(
        (row) => row.day === windowStart,
      )
        ?? rows.find((row) => row.day >= windowStart);
      if (fallbackRow && windowStart <= firstActive) {
        baselineRow = fallbackRow;
        baselineDate = fallbackRow.day;
        if (Array.isArray(fallbackRow.missingBaselineSymbols)) {
          missingBaselineSymbols = fallbackRow.missingBaselineSymbols;
        }
        const resolvedSameDay = fallbackRow.resolvedUnrealized;
        if (
          typeof resolvedSameDay === "number" &&
          Number.isFinite(resolvedSameDay)
        ) {
          baselineValue = resolvedSameDay;
          baselineMode = "priced";
        } else {
          baselineMode = "partial";
        }
      } else {
        degradeReason = "DEGEN_NO_BASELINE";
      }
    } else {
      baselineDate = baselineRow.day;
      if (Array.isArray(baselineRow.missingBaselineSymbols)) {
        missingBaselineSymbols = baselineRow.missingBaselineSymbols;
      }
      const resolved = baselineRow.resolvedUnrealized;
      if (typeof resolved === "number" && Number.isFinite(resolved)) {
        baselineValue = resolved;
        baselineMode = "priced";
      } else {
        baselineMode = "partial";
      }

      if (
        typeof baselineDistance === "number" &&
        baselineDistance > STALE_BASELINE_BDAYS
      ) {
        degradeReason = "DEGEN_STALE_BASELINE";
        baselineMode = "missing";
      }

      if (baselineRow.parseErrors?.length) {
        windowParseErrors.push(
          ...baselineRow.parseErrors.map((err) => ({ ...err })),
        );
      }
    }

    if (
      baselineRow?.sameDayDuplicateCount &&
      baselineRow.sameDayDuplicateCount > 0 &&
      baselineRow.day < windowStart
    ) {
      sameDayDuplicates += baselineRow.sameDayDuplicateCount;
    }

    const hasWindowRows = rows.some(
      (row) => row.day >= windowStart && row.day <= evalDay,
    );

    let missingEndValue = false;
    let endValue: number | undefined;
    const resolvedEnd = endRow?.resolvedUnrealized;
    if (typeof resolvedEnd === "number" && Number.isFinite(resolvedEnd)) {
      endValue = resolvedEnd;
    } else {
      missingEndValue = true;
    }

    if (!hasWindowRows && !degradeReason) {
      degradeReason = "DEGEN_WINDOW_EMPTY";
    }

    if (missingEndValue && !degradeReason) {
      degradeReason = "DEGEN_WINDOW_EMPTY";
    }

    const hasParseFailure =
      realizedParseFailure || windowParseErrors.length > 0;

    if (hasParseFailure) {
      degradeReason = "DEGEN_PARSE_FAILED";
    }

    let unrealizedDelta: number | undefined;
    if (!missingEndValue && baselineMode === "priced" && typeof baselineValue === "number") {
      unrealizedDelta = endValue! - baselineValue;
    }

    const degraded = Boolean(degradeReason) || missingEndValue;

    let total = realized;
    if (typeof unrealizedDelta === "number") {
      total += unrealizedDelta;
    }
    if (degraded) {
      total = Number.NaN;
    }

    let status: PeriodWindowStatus = "ok";
    if (baselineMode === "partial") {
      status = "partial";
    } else if (baselineMode === "missing" && !degraded) {
      status = "missing";
    }
    if (degraded) {
      status = "degraded";
    }

    const breakdown: PeriodWindowBreakdown = {
      realized,
      ...(typeof unrealizedDelta === "number"
        ? { unrealizedDelta }
        : {}),
      ...(baselineDate ? { baselineDate } : {}),
      baselineMode,
      ...(missingBaselineSymbols?.length
        ? { missingBaselineSymbols }
        : {}),
    };

    return {
      total,
      degraded,
      status,
      breakdown,
      reason: degradeReason,
      baselineMeta,
      parseErrors: windowParseErrors,
      sameDayDuplicates,
    };
  };

  const weekStart = weekStartForEvalDay(evalDay);
  const monthStart = `${evalDay.slice(0, 7)}-01`;
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;

  const week = computeWindow(weekStart);
  const month = computeWindow(monthStart);
  const year = computeWindow(yearStart);

  const buildDiagnostics = (
    window: ReturnType<typeof computeWindow>,
    windowStart: string,
  ): PeriodWindowDiagnostics => ({
    status: window.status,
    degraded: window.degraded,
    ...(window.reason ? { reason: window.reason } : {}),
    ...(window.baselineMeta ? { baselineMeta: window.baselineMeta } : {}),
    ...(window.parseErrors.length
      ? { parseErrors: window.parseErrors }
      : {}),
    ...(window.sameDayDuplicates
      ? { sameDayDuplicates: window.sameDayDuplicates }
      : {}),
    uiTradeDayYmd,
    periodEvalYmd: evalDay,
    filteredRowsCount,
    ...(lastSnapshotYmd ? { lastSnapshotYmd } : {}),
    windowStartYmd: windowStart,
  });

  return {
    wtd: week.total,
    mtd: month.total,
    ytd: year.total,
    degraded: {
      wtd: week.degraded,
      mtd: month.degraded,
      ytd: year.degraded,
    },
    firstActiveDate: firstActive,
    breakdown: {
      wtd: week.breakdown,
      mtd: month.breakdown,
      ytd: year.breakdown,
    },
    status: {
      wtd: week.status,
      mtd: month.status,
      ytd: year.status,
    },
    diagnostics: {
      wtd: buildDiagnostics(week, weekStart),
      mtd: buildDiagnostics(month, monthStart),
      ytd: buildDiagnostics(year, yearStart),
    },
  };
}

export function calcWtdMtdYtd(daily: DailyResultInput[], evalDateStr: string) {
  const evalDay = nyDayStr(evalDateStr);
  const rows = normalizeDailyRowsForWindow(daily, evalDay);
  const firstActive = rows[0]?.day;
  const totals = deriveWindowTotals(rows, evalDay, {
    firstActiveDate: firstActive,
  });
  return { wtd: totals.wtd, mtd: totals.mtd, ytd: totals.ytd };
}

export type WtdMtdYtdExplain = ReturnType<typeof explainWtdMtdYtdFromSnapshots>;
let __lastWtdMtdYtdExplain: WtdMtdYtdExplain | null = null;
export function getLastWtdMtdYtdExplain(): WtdMtdYtdExplain | null {
  return __lastWtdMtdYtdExplain;
}

export function calcWtdMtdYtdFromSnapshots(
  daily: DailyResultInput[] = [],
  evalDayStr: string,
  options: WindowTotalsOptions = {},
): WindowTotalsResult {
  const evalDay = nyDayStr(evalDayStr);
  const rows = normalizeDailyRowsForWindow(daily, evalDay);
  const totals = deriveWindowTotals(rows, evalDay, {
    ...options,
  });

  try {
    if (typeof window !== "undefined") {
      __lastWtdMtdYtdExplain = explainWtdMtdYtdFromSnapshots(
        daily,
        evalDayStr,
        options,
      );
    }
  } catch {
    // noop: 调试缓存失败不影响业务
  }

  return totals;
}

export function explainWtdMtdYtdFromSnapshots(
  daily: DailyResultInput[] = [],
  evalDayStr: string,
  options: WindowTotalsOptions = {},
) {
  const evalDay = nyDayStr(evalDayStr);
  const rows = normalizeDailyRowsForWindow(daily, evalDay);
  const resolved = resolveUnrealizedForWindow(rows);
  const totals = deriveWindowTotals(rows, evalDay, options);

  const calendar = new Map<string, number>();
  for (const row of resolved) {
    calendar.set(row.day, row.realized + (row.unrealizedDelta ?? 0));
  }

  const toRows = (start: string, end: string) => {
    const list: { day: string; pnl: number }[] = [];
    let cursor = start;
    while (cursor <= end) {
      list.push({ day: cursor, pnl: calendar.get(cursor) ?? 0 });
      cursor = addDaysYmd(cursor, 1);
    }
    return list;
  };

  const weekStart = weekStartForEvalDay(evalDay);
  const monthStart = `${evalDay.slice(0, 7)}-01`;
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;
  const yearEnd = `${evalDay.slice(0, 4)}-12-31`;

  return {
    evalDay,
    calendar: Array.from(calendar.entries()).map(([day, pnl]) => ({ day, pnl })),
    totals: { wtd: totals.wtd, mtd: totals.mtd, ytd: totals.ytd },
    ranges: {
      week: { start: weekStart, end: evalDay, rows: toRows(weekStart, evalDay) },
      month: { start: monthStart, end: evalDay, rows: toRows(monthStart, evalDay) },
      year: { start: yearStart, end: evalDay, rows: toRows(yearStart, evalDay) },
    },
    boundaries: {
      yearStart,
      yearEnd,
      weekStart,
      monthStart,
      ytdEnd: evalDay,
    },
    firstActiveDate: totals.firstActiveDate,
    baselineMode: {
      week: totals.breakdown.wtd.baselineMode,
      month: totals.breakdown.mtd.baselineMode,
      year: totals.breakdown.ytd.baselineMode,
    },
    baseline: {
      week: totals.breakdown.wtd,
      month: totals.breakdown.mtd,
      year: totals.breakdown.ytd,
    },
    status: {
      week: totals.status.wtd,
      month: totals.status.mtd,
      year: totals.status.ytd,
    },
    diagnostics: totals.diagnostics,
  };
}

export function calcM9FromDaily(
  daily: DailyResult[],
  evalDateStr: string,
): number {
  const end = toNY(evalDateStr).getTime();
  let total = 0;
  for (const r of daily) {
    const ts = toNY(r.date).getTime();
    if (ts <= end) total += r.realized ?? 0;
  }
  return total;
}

export function checkPeriodDebug(daily: DailyResult[], evalDateStr: string) {
  if (!DEBUG) return;
  const evalDay = nyDayStr(evalDateStr);
  const rows = normalizeDailyRowsForWindow(daily, evalDay);
  const totals = deriveWindowTotals(rows, evalDay, {
    firstActiveDate: rows[0]?.day,
  });
  const weekStart = weekStartForEvalDay(evalDay);
  const monthStart = `${evalDay.slice(0, 7)}-01`;
  const yearStart = `${evalDay.slice(0, 4)}-01-01`;
  const m9 = calcM9FromDaily(daily, evalDateStr);
  console.table([
    { metric: "evalDateStr", value: evalDateStr },
    { metric: "weekStart", value: weekStart },
    { metric: "monthStart", value: monthStart },
    { metric: "yearStart", value: yearStart },
    { metric: "ytdEnd", value: evalDay },
    { metric: "wtd", value: totals.wtd, expected: 8952.5 },
    { metric: "mtd", value: totals.mtd, expected: 8952.5 },
    { metric: "ytd", value: totals.ytd, expected: 8952.5 },
    { metric: "M9", value: m9, expected: 7850 },
  ]);
}

/**
 * 计算日内交易盈亏（FIFO视角）
 */
export function calcTodayFifoPnL(
  sortedTrades: EnrichedTrade[],
  todayStr: string,
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const todayLongLots: Record<string, { qty: number }[]> = {};
  const todayShortLots: Record<string, { qty: number }[]> = {};
  seedInitialLots(sortedTrades, longFifo, shortFifo);
  let pnl = 0;
  for (const t of sortedTrades) {
    if (t.isInitialPosition) {
      continue;
    }
    if (!isValidTradeDate(t.date, todayStr, "calcTodayFifoPnL", t)) continue;
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);
    const isToday = isTodayNY(date, todayStr);
    if (action === "buy") {
      if (isToday) {
        if (!todayLongLots[symbol]) todayLongLots[symbol] = [];
        todayLongLots[symbol]!.push({ qty: quantity });
      }
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "sell") {
      let intradayQty = 0;
      if (isToday) {
        const todayLots = todayLongLots[symbol] || [];
        let remainToday = quantity;
        while (remainToday > 0 && todayLots.length > 0) {
          const lot = todayLots[0]!;
          const use = Math.min(lot.qty, remainToday);
          intradayQty += use;
          lot.qty -= use;
          remainToday -= use;
          if (lot.qty <= EPSILON) todayLots.shift();
        }
      }
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (intradayQty > 0) {
          const use = Math.min(q, intradayQty);
          pnl += (price - lot.price) * use;
          intradayQty -= use;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol].push({ qty: remain, price, date });
      }
    } else if (action === "short") {
      if (isToday) {
        if (!todayShortLots[symbol]) todayShortLots[symbol] = [];
        todayShortLots[symbol]!.push({ qty: quantity });
      }
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "cover") {
      let intradayQty = 0;
      if (isToday) {
        const todayLots = todayShortLots[symbol] || [];
        let remainToday = quantity;
        while (remainToday > 0 && todayLots.length > 0) {
          const lot = todayLots[0]!;
          const use = Math.min(lot.qty, remainToday);
          intradayQty += use;
          lot.qty -= use;
          remainToday -= use;
          if (lot.qty <= EPSILON) todayLots.shift();
        }
      }
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (intradayQty > 0) {
          const use = Math.min(q, intradayQty);
          pnl += (lot.price - price) * use;
          intradayQty -= use;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol].push({ qty: remain, price, date });
      }
    }
  }
  return pnl;
}

/**
 * 计算历史交易盈亏（FIFO视角）——用于 M4
 */
export function calcHistoryFifoPnL(
  sortedTrades: EnrichedTrade[],
  todayStr: string,
): number {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  seedInitialLots(sortedTrades, longFifo, shortFifo);
  let pnl = 0;
  for (const t of sortedTrades) {
    if (t.isInitialPosition) {
      continue;
    }
    if (!isValidTradeDate(t.date, todayStr, "calcHistoryFifoPnL", t)) continue;
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);
    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "sell") {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && !isTodayNY(lot.date, todayStr)) {
          pnl += (price - lot.price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol].push({ qty: remain, price, date });
      }
    } else if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
    } else if (action === "cover") {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        if (isTodayNY(date, todayStr) && !isTodayNY(lot.date, todayStr)) {
          pnl += (lot.price - price) * q;
        }
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol].push({ qty: remain, price, date });
      }
    }
  }
  return pnl;
}

export function debugTodayRealizedBreakdown(
  trades: EnrichedTrade[],
  evalDateStr: string,
): { rows: RealizedBreakdownRow[]; sumM4: number; sumM52: number } {
  const longFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  const shortFifo: Record<
    string,
    { qty: number; price: number; date: string }[]
  > = {};
  seedInitialLots(trades, longFifo, shortFifo);

  const sorted = trades
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => isOnOrBeforeNY(t.date, evalDateStr))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  const rows: RealizedBreakdownRow[] = [];

  for (const t of sorted) {
    const { symbol, action, price, date } = t;
    const quantity = Math.abs(t.quantity);

    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol].push({ qty: quantity, price, date });
      continue;
    }

    if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol].push({ qty: quantity, price, date });
      continue;
    }

    const isCloseToday = isTodayNY(date, evalDateStr);
    let remain = quantity;
    const fifo =
      action === "sell" ? longFifo[symbol] || [] : shortFifo[symbol] || [];

    while (remain > 0 && fifo.length > 0) {
      const lot = fifo[0]!;
      const q = Math.min(lot.qty, remain);
      if (isCloseToday) {
        const openToday = isTodayNY(lot.date, evalDateStr);
        const into = openToday ? "M5.2" : "M4";
        const openPrice = lot.price;
        const closePrice = price;
        const pnl =
          action === "sell"
            ? (closePrice - openPrice) * q
            : (openPrice - closePrice) * q;
        rows.push({
          time: date,
          symbol,
          side: action,
          into,
          qty: q,
          openPrice,
          closePrice,
          pnl,
        });
      }
      lot.qty -= q;
      remain -= q;
      if (lot.qty === 0) fifo.shift();
    }

    if (remain > 0) {
      if (action === "sell") {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol]!.push({ qty: remain, price, date });
      } else if (action === "cover") {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol]!.push({ qty: remain, price, date });
      }
    }
  }

  const sumM4 = rows
    .filter((r) => r.into === "M4")
    .reduce((acc, r) => acc + r.pnl, 0);
  const sumM52 = rows
    .filter((r) => r.into === "M5.2")
    .reduce((acc, r) => acc + r.pnl, 0);

  return { rows, sumM4, sumM52 };
}

/**
 * 累计交易次数（含历史持仓一次）
 */
function calcCumulativeTradeCounts(trades: EnrichedTrade[]) {
  let B = 0;
  let S = 0;
  let P = 0;
  let C = 0;

  for (const t of trades) {
    switch (t.action) {
      case "buy":
        B++;
        break;
      case "sell":
        S++;
        break;
      case "short":
        P++;
        break;
      case "cover":
        C++;
        break;
    }
  }
  return { B, S, P, C, total: B + S + P + C };
}

export function calcM9(days: DailyResult[], evalDateStr?: string): number {
  if (evalDateStr) {
    return calcM9FromDaily(days, evalDateStr);
  }
  return sumRealized(days);
}

/**
 * Collect all closed lots (FIFO) up to a given date.
 */
export function collectCloseLots(
  sortedTrades: EnrichedTrade[],
  untilDateStr?: string,
): { pnl: number }[] {
  const longFifo: Record<string, { qty: number; price: number }[]> = {};
  const shortFifo: Record<string, { qty: number; price: number }[]> = {};

  for (const trade of sortedTrades) {
    if (!trade.isInitialPosition) continue;
    const qty = Math.abs(trade.quantity);
    if (qty === 0) continue;
    const lot = { qty, price: trade.price };
    if (trade.action === "short") {
      if (!shortFifo[trade.symbol]) shortFifo[trade.symbol] = [];
      shortFifo[trade.symbol]!.push(lot);
    } else {
      if (!longFifo[trade.symbol]) longFifo[trade.symbol] = [];
      longFifo[trade.symbol]!.push(lot);
    }
  }

  const untilEnd = untilDateStr
    ? endOfDayNY(toNY(`${untilDateStr}T12:00:00Z`))
    : undefined;

  const closes: { pnl: number }[] = [];

  for (const t of sortedTrades) {
    if (untilEnd) {
      const d = toNY(t.date);
      if (isNaN(d.getTime()) || d.getTime() > untilEnd.getTime()) continue;
    }
    const { symbol, action, price } = t;
    const quantity = Math.abs(t.quantity);

    if (action === "buy") {
      if (!longFifo[symbol]) longFifo[symbol] = [];
      longFifo[symbol]!.push({ qty: quantity, price });
    } else if (action === "short") {
      if (!shortFifo[symbol]) shortFifo[symbol] = [];
      shortFifo[symbol]!.push({ qty: quantity, price });
    } else if (action === "sell") {
      let remain = quantity;
      const fifo = longFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        closes.push({ pnl: (price - lot.price) * q });
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!shortFifo[symbol]) shortFifo[symbol] = [];
        shortFifo[symbol]!.push({ qty: remain, price });
      }
    } else if (action === "cover") {
      let remain = quantity;
      const fifo = shortFifo[symbol] || [];
      while (remain > 0 && fifo.length > 0) {
        const lot = fifo[0]!;
        const q = Math.min(lot.qty, remain);
        closes.push({ pnl: (lot.price - price) * q });
        lot.qty -= q;
        remain -= q;
        if (lot.qty === 0) fifo.shift();
      }
      if (remain > 0) {
        if (!longFifo[symbol]) longFifo[symbol] = [];
        longFifo[symbol]!.push({ qty: remain, price });
      }
    }
  }

  return closes;
}

/**
 * 计算所有交易指标
 */
export function calcMetricsInternal(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = [],
  options: CalcMetricsOptions = {},
): Metrics {
  if (DEBUG)
    logger.debug("M7_INPUT", _count(trades), {
      sample: trades.slice(0, 3),
    });

  // 注意：评估日必须使用显式 periodEvalYmd（入参优先，其次 nyTodayStr）。
  // UI 展示日可继续调用 getLatestTradingDayStr，但严禁用其回退 periodEvalYmd。
  const resolveNyDay = (input?: string) => {
    if (typeof input !== "string") return undefined;
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    try {
      return nyDayStr(trimmed);
    } catch (error) {
      if (DEBUG) {
        logger.debug("PERIOD_EVAL_RESOLVE_FAIL", { input, error });
      }
      return undefined;
    }
  };

  const providedEvalDay = resolveNyDay(options.periodEvalYmd);
  const providedUiTradeDay = resolveNyDay(options.tradingDateStr);
  const freezeEnvValue =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_FREEZE_DATE
      : undefined;
  const freezeWindowValue =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).NEXT_PUBLIC_FREEZE_DATE
      : undefined;
  const freezeCandidate =
    typeof freezeEnvValue === "string"
      ? freezeEnvValue
      : typeof freezeWindowValue === "string"
        ? freezeWindowValue
        : undefined;
  const freezeEvalDay = resolveNyDay(freezeCandidate);
  const periodEvalStr = providedEvalDay ?? freezeEvalDay ?? nyTodayStr();
  const evalAnchorNY = toNY(`${periodEvalStr}T12:00:00Z`);
  const uiTradeDayYmd =
    providedUiTradeDay ?? getLatestTradingDayStr(evalAnchorNY);
  const evalEnd = endOfDayNY(evalAnchorNY);

  const safeTrades: EnrichedTrade[] = [];
  const tradeEntries: Array<{ trade: EnrichedTrade; date: Date; day: string }> =
    [];
  let earliestTradeDay: string | undefined;

  for (const trade of trades) {
    const parsed = resolveTradeDate(trade);
    if (!parsed) continue;
    if (parsed.getTime() > evalEnd.getTime()) continue;

    const day = nyDayStr(parsed);

    const normalizedDateValue = normalizeDateLikeValue(trade.date);
    const normalizedTimeValue = normalizeDateLikeValue(
      trade.time as string | number | Date | undefined,
    );
    const canonicalDate =
      normalizedDateValue ?? normalizedTimeValue ?? parsed.toISOString();
    const canonicalTime =
      normalizedTimeValue ?? normalizedDateValue ?? parsed.toISOString();

    const normalizedTrade: EnrichedTrade = {
      ...trade,
      date: canonicalDate,
      time: canonicalTime,
    };

    safeTrades.push(normalizedTrade);
    tradeEntries.push({ trade: normalizedTrade, date: parsed, day });
    if (!normalizedTrade.isInitialPosition) {
      if (!earliestTradeDay || day < earliestTradeDay) {
        earliestTradeDay = day;
      }
    }
  }

  const todayStr = periodEvalStr;

  const nowInstant = nowNY();

  const officialCloseMap: ClosePriceMap =
    (options.officialCloseMap as ClosePriceMap | undefined) ?? {};
  const officialOverlayMap: ClosePriceMap =
    (options.officialCloseOverlayMap as ClosePriceMap | undefined) ??
    overlayCacheToMap();
  const missingOfficialDiagnostics = createMissingOfficialCloseDiagnostics();
  const { missingOfficialCloses, pendingOfficialCloses } =
    missingOfficialDiagnostics;
  const prevCloseDateForContext = previousTradingDay(todayStr);
  const fallbackKeySet = new Set<string>();
  if (prevCloseDateForContext) {
    for (const pos of positions) {
      const symbol = typeof pos?.symbol === "string" ? pos.symbol.trim().toUpperCase() : "";
      if (!symbol) continue;
      const prevCloseValue = Number(pos?.prevClose);
      if (Number.isFinite(prevCloseValue)) {
        fallbackKeySet.add(`${symbol}|${prevCloseDateForContext}`);
      }
    }
  }
  const releaseOfficialContext = setOfficialCloseContext({
    map: officialCloseMap,
    overlayMap: officialOverlayMap,
    diagnostics: missingOfficialDiagnostics,
    fallbackResolver: (symbol, date) =>
      fallbackKeySet.has(`${symbol.trim().toUpperCase()}|${date}`),
    closeWindowEvaluator: (date) =>
      evaluateCloseWindow(date, nowInstant).inWindow,
    resolveTargetDate: () => todayStr,
  });

  const todayTrades = tradeEntries
    .filter((entry) => entry.day === todayStr)
    .map((entry) => entry.trade);

  const counts = _count(todayTrades);

  if (DEBUG)
    logger.debug(
      "M7_FILTERED",
      { all: _count(safeTrades), today: counts },
      {
        evalEndNY: evalEnd.toISOString?.(),
      },
    );

  const sortedTrades = sortTrades(safeTrades);

  // M1: 持仓成本
  const totalCost = sum(positions.map((p) => Math.abs(p.avgPrice * p.qty)));

  // M2: 持仓市值
  const currentValue = sum(
    positions.map((p) => {
      const marketValue = p.last * Math.abs(p.qty);
      return marketValue;
    }),
  );

  // M3: 持仓浮盈
  const floatPnl = positions.reduce((acc, pos) => {
    const qty = Math.abs(pos.qty);
    if (pos.qty >= 0) {
      return acc + (pos.last - pos.avgPrice) * qty;
    } else {
      return acc + (pos.avgPrice - pos.last) * qty;
    }
  }, 0);

  // M5
  const pnlTrade = calcTodayTradePnL(sortedTrades, todayStr);
  const pnlFifo = calcTodayFifoPnL(sortedTrades, todayStr);

  // M4
  const todayHistoricalRealizedPnl = calcHistoryFifoPnL(
    sortedTrades,
    todayStr,
  );

  // === BEGIN M6 STRICT: 严格按指定口径计算 ===

  // 先整理 todayTrades（你上面已有 todayTrades）
  // positionMap 已不需要复杂推导；我们直接用严格版函数
  const lastTradePriceToday = new Map<string, number>();
  for (const t of todayTrades) {
    if (t?.symbol && Number.isFinite(Number(t.price))) {
      lastTradePriceToday.set(t.symbol, Number(t.price));
    }
  }

  let strict: ReturnType<typeof _calcM6Strict>;
  try {
    strict = _calcM6Strict({
      positions,
      todayTrades,
      sortedTrades,
      todayStr,
      M4: todayHistoricalRealizedPnl,
      M5_2: pnlFifo,
      lastPriceFallback: (symbol) => {
        const p = lastTradePriceToday.get(symbol);
        return Number.isFinite(Number(p)) ? Number(p) : null;
      },
    });
  } finally {
    releaseOfficialContext();
  }

  const todayTotalPnlChange = strict.M6;
  const priceChangeRounded = mRound2(
    strict.mtmOvernight + strict.mtmIntradayOpen,
  );
  const legsForAux = strict.legs.map((leg) => ({
    symbol: leg.symbol,
    qty: leg.qty,
    basis: leg.basis,
    mark: leg.mark,
    amount: leg.amount,
    component: leg.component,
    ...(leg.direction ? { direction: leg.direction } : {}),
  }));
  const m6Details = {
    realizedToday: mRound2(strict.realizedToday),
    mtmOvernight: mRound2(strict.mtmOvernight),
    mtmIntradayOpen: mRound2(strict.mtmIntradayOpen),
    warnings: strict.warnings,
  };
  const missingPrevCloseList = strict.missingPrevCloseSymbols ?? [];
  const m4Degraded = missingPrevCloseList.length > 0;
  const m4Today = createM4TodayDetail({
    realized: strict.realizedToday,
    mtmOvernight: strict.mtmOvernight,
    mtmIntradayOpen: strict.mtmIntradayOpen,
    degraded: m4Degraded,
  });

  if (DEBUG)
    logger.debug("M6_DEBUG_STRICT", {
      prevRealized: todayHistoricalRealizedPnl,
      fifo: pnlFifo,
      mtmNetChange: priceChangeRounded,
      total: todayTotalPnlChange,
    });

  // === END M6 STRICT ===

  // M7
  const todayTradeCountsByType = counts;
  const todayTradeCounts = counts.total;

  // M8
  const allTradesByType = calcCumulativeTradeCounts(safeTrades);
  const totalTrades = allTradesByType.total;

  const endTs = endOfDayNY(toNY(`${periodEvalStr}T12:00:00Z`)).getTime();
  const historicalDailyResults = dailyResults.filter((r) => {
    const dayTs = startOfDayNY(normalizeToNyDay(r.date)).getTime();
    return Number.isFinite(dayTs) && dayTs <= endTs;
  });

  let earliestDailyDay: string | undefined;
  for (const row of historicalDailyResults) {
    const day = nyDayStr(row.date);
    if (!earliestDailyDay || day < earliestDailyDay) {
      earliestDailyDay = day;
    }
  }

  const firstActiveDate = [earliestTradeDay, earliestDailyDay]
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort()[0];

  // M9
  const historicalRealizedPnl = calcM9(historicalDailyResults, periodEvalStr);

  // M10
  const closes = collectCloseLots(sortedTrades, todayStr);
  const { win, loss, flat, rate } = calcWinLossLots(closes);

  // M11-13
  const periodSnapshot = calcWtdMtdYtdFromSnapshots(
    historicalDailyResults,
    periodEvalStr,
    { firstActiveDate, uiTradeDayYmd },
  );
  const {
    wtd,
    mtd,
    ytd,
    degraded: baseDegraded,
    breakdown: periodBreakdown,
    status: basePeriodStatus,
    firstActiveDate: resolvedFirstActiveDate,
    diagnostics: basePeriodDiagnostics,
  } = periodSnapshot;

  const missingSummaryByDate = summarizeMissingOfficialCloses(
    missingOfficialCloses,
  );
  const pendingSummaryByDate = summarizeMissingOfficialCloses(
    pendingOfficialCloses,
  );

  const periodWindowStarts: Record<PeriodWindowKey, string> = {
    wtd: weekStartForEvalDay(periodEvalStr),
    mtd: `${periodEvalStr.slice(0, 7)}-01`,
    ytd: `${periodEvalStr.slice(0, 4)}-01-01`,
  };

  const officialByWindow: Record<
    PeriodWindowKey,
    PeriodWindowOfficialCloseDiagnostics
  > = {
    wtd: buildOfficialDiagnosticsForWindow(
      missingSummaryByDate,
      pendingSummaryByDate,
      periodWindowStarts.wtd,
      periodEvalStr,
    ),
    mtd: buildOfficialDiagnosticsForWindow(
      missingSummaryByDate,
      pendingSummaryByDate,
      periodWindowStarts.mtd,
      periodEvalStr,
    ),
    ytd: buildOfficialDiagnosticsForWindow(
      missingSummaryByDate,
      pendingSummaryByDate,
      periodWindowStarts.ytd,
      periodEvalStr,
    ),
  };

  const officialDegradedFlags: PeriodDegradedMap = {
    wtd: officialByWindow.wtd.missing.length > 0,
    mtd: officialByWindow.mtd.missing.length > 0,
    ytd: officialByWindow.ytd.missing.length > 0,
  };

  const combinedDegraded: PeriodDegradedMap = {
    wtd: baseDegraded.wtd || officialDegradedFlags.wtd,
    mtd: baseDegraded.mtd || officialDegradedFlags.mtd,
    ytd: baseDegraded.ytd || officialDegradedFlags.ytd,
  };

  const periodStatusWithOfficial: Record<PeriodWindowKey, PeriodWindowStatus> = {
    wtd: basePeriodStatus?.wtd ?? (combinedDegraded.wtd ? "degraded" : "ok"),
    mtd: basePeriodStatus?.mtd ?? (combinedDegraded.mtd ? "degraded" : "ok"),
    ytd: basePeriodStatus?.ytd ?? (combinedDegraded.ytd ? "degraded" : "ok"),
  };

  for (const key of ["wtd", "mtd", "ytd"] as const) {
    if (officialDegradedFlags[key]) {
      const current = periodStatusWithOfficial[key];
      if (current !== "missing" && current !== "partial") {
        periodStatusWithOfficial[key] = "degraded";
      }
    }
  }

  const periodDiagnosticsWithOfficial: Record<
    PeriodWindowKey,
    PeriodWindowDiagnostics
  > = {} as Record<PeriodWindowKey, PeriodWindowDiagnostics>;

  for (const key of ["wtd", "mtd", "ytd"] as const) {
    const existing = clonePeriodWindowDiagnostics(basePeriodDiagnostics?.[key]);
    const official = officialByWindow[key];
    const mergedReasons = mergeDegradeReasons(
      existing?.degradeReasons,
      official.missing,
    );
    const diag: PeriodWindowDiagnostics =
      existing ?? {
        status: periodStatusWithOfficial[key],
        degraded: combinedDegraded[key],
      };
    diag.status = periodStatusWithOfficial[key];
    diag.degraded = combinedDegraded[key];
    if (diag.degradeReasons) {
      delete diag.degradeReasons;
    }
    if (mergedReasons.length > 0) {
      diag.degradeReasons = mergedReasons;
    }
    if (diag.officialClose) {
      delete diag.officialClose;
    }
    if (official.missing.length > 0 || official.pending.length > 0) {
      diag.officialClose = cloneOfficialDiagnostics(official);
    }
    periodDiagnosticsWithOfficial[key] = diag;
  }

  const diagnosticSnapshots = basePeriodDiagnostics ?? {};
  const lastSnapshotYmd =
    diagnosticSnapshots.wtd?.lastSnapshotYmd ??
    diagnosticSnapshots.mtd?.lastSnapshotYmd ??
    diagnosticSnapshots.ytd?.lastSnapshotYmd;
  const filteredRowsCount =
    diagnosticSnapshots.wtd?.filteredRowsCount ??
    diagnosticSnapshots.mtd?.filteredRowsCount ??
    diagnosticSnapshots.ytd?.filteredRowsCount;

  if (
    uiTradeDayYmd &&
    uiTradeDayYmd !== periodEvalStr &&
    lastSnapshotYmd === periodEvalStr
  ) {
    logger.debug("PERIOD_EVAL_DAY_INCLUDED", {
      uiTradeDayYmd,
      periodEvalYmd: periodEvalStr,
      lastSnapshotYmd,
      filteredRowsCount,
    });
  }
  if (DEBUG) {
    try {
      checkPeriodDebug(historicalDailyResults ?? dailyResults, periodEvalStr);
    } catch (error) {
      logger.debug("METRICS_DEBUG_PERIOD", { error });
    }
  }

  const metrics: Metrics = {
    M1: totalCost,
    M2: currentValue,
    M3: floatPnl,
    M4: todayHistoricalRealizedPnl,
    M5: {
      trade: pnlTrade,
      fifo: pnlFifo,
    },
    M6: todayTotalPnlChange,
    M4_today: m4Today,
    _m6: m6Details,
    M7: {
      B: todayTradeCountsByType.B,
      S: todayTradeCountsByType.S,
      P: todayTradeCountsByType.P,
      C: todayTradeCountsByType.C,
      total: todayTradeCounts,
    },
    M8: {
      B: allTradesByType.B,
      S: allTradesByType.S,
      P: allTradesByType.P,
      C: allTradesByType.C,
      total: totalTrades,
    },
    M9: historicalRealizedPnl,
    M10: {
      win,
      loss,
      flat,
      rate,
    },
    M11: wtd,
    M12: mtd,
    M13: ytd,
    aux: {
      m6PriceChange: priceChangeRounded,
      m6PrevRealizedTotal: mRound2(todayHistoricalRealizedPnl),
      m6FifoToday: mRound2(pnlFifo),
      m6Legs: legsForAux,
      missingPrevCloseSymbols: missingPrevCloseList,
    },
  };

  if (missingOfficialCloses.length > 0 || pendingOfficialCloses.length > 0) {
    metrics.diagnostics = {
      ...(missingOfficialCloses.length > 0
        ? { missingOfficialCloses }
        : {}),
      ...(pendingOfficialCloses.length > 0
        ? { pendingOfficialCloses }
        : {}),
    };
  }

  metrics._period = {
    degraded: combinedDegraded,
    ...(periodStatusWithOfficial ? { status: periodStatusWithOfficial } : {}),
    ...(periodBreakdown ? { breakdown: periodBreakdown } : {}),
    ...(resolvedFirstActiveDate
      ? { firstActiveDate: resolvedFirstActiveDate }
      : {}),
    ...(periodDiagnosticsWithOfficial
      ? { diagnostics: periodDiagnosticsWithOfficial }
      : {}),
  };

  assertM6(metrics);

  return metrics;
}

export function calcMetrics(
  trades: EnrichedTrade[],
  positions: Position[],
  dailyResults: DailyResult[] = [],
  options: CalcMetricsOptions = {},
): Metrics {
  try {
    return calcMetricsInternal(trades, positions, dailyResults, options);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error("calcMetrics failed", e);
    reportMonitoring("calcMetrics failed", {
      error: e.message,
      stack: e.stack,
    });
    throw err;
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value)) return "N/A";
  return value.toFixed(decimals);
}

export function normalizeMetrics(input: any): MetricsContract {
  const pickTotal = (v: any) => (typeof v === "number" ? v : v?.total ?? 0);
  const normalizeCounts = (value: any) => {
    const B = Number(value?.B ?? value?.buy ?? 0);
    const S = Number(value?.S ?? value?.sell ?? 0);
    const P = Number(value?.P ?? value?.short ?? 0);
    const C = Number(value?.C ?? value?.cover ?? 0);
    const totalRaw = value?.total;
    const total =
      totalRaw !== undefined && Number.isFinite(Number(totalRaw))
        ? Number(totalRaw)
        : B + S + P + C;
    return { B, S, P, C, total };
  };
  const normalizeWinLoss = (value: any) => {
    const win = Number(value?.win ?? value?.W ?? 0);
    const loss = Number(value?.loss ?? value?.L ?? 0);
    const flat = Number(value?.flat ?? value?.F ?? 0);
    const rateRaw = value?.rate ?? value?.winRate ?? value?.winRatePct;
    let rate = Number(rateRaw);
    if (!Number.isFinite(rate)) {
      const denom = win + loss;
      rate = denom > 0 ? win / denom : 0;
    } else if (rate > 1.0000001) {
      rate = rate / 100;
    }
    return { win, loss, flat, rate };
  };

  const M1 = Number(input?.M1 ?? 0);
  const M2 = Number(input?.M2 ?? 0);
  const M3 = Number(input?.M3 ?? 0);
  const M4 = Number.isFinite(Number(input?.M4))
    ? Number(input?.M4)
    : pickTotal(input?.M4);
  const M5 = {
    behavior: Number(
      input?.M5?.behavior ?? input?.M5?.trade ?? input?.M5_1 ?? 0,
    ),
    fifo: Number(input?.M5?.fifo ?? input?.M5_2 ?? 0),
  };
  const M6 = { total: pickTotal(input?.M6) };
  const rawPriceChange = input?.aux?.m6PriceChange ?? input?.M6?.priceChange;
  const priceChange =
    typeof rawPriceChange === "number" && Number.isFinite(rawPriceChange)
      ? rawPriceChange
      : undefined;
  const prevRealized = input?.aux?.m6PrevRealizedTotal;
  const fifoToday = input?.aux?.m6FifoToday;
  const rawRealizedToday = Number(input?._m6?.realizedToday);
  const rawRealizedTotalAux = Number(input?.aux?.realized?.today_total);
  const rawRealizedIntradayAux = Number(input?.aux?.realized?.today_intraday);
  const rawMtmOvernight = Number(input?._m6?.mtmOvernight);
  const rawMtmIntraday = Number(input?._m6?.mtmIntradayOpen);
  const realizedToday = Number.isFinite(rawRealizedTotalAux)
    ? rawRealizedTotalAux
    : Number.isFinite(rawRealizedToday)
    ? rawRealizedToday
    : Number.isFinite(prevRealized) && Number.isFinite(fifoToday)
    ? Number(prevRealized) + Number(fifoToday)
    : 0;
  const realizedIntraday = Number.isFinite(rawRealizedIntradayAux)
    ? rawRealizedIntradayAux
    : Number.isFinite(fifoToday)
    ? Number(fifoToday)
    : 0;
  const mtmOvernight = Number.isFinite(rawMtmOvernight)
    ? rawMtmOvernight
    : priceChange ?? 0;
  const mtmIntradayOpen = Number.isFinite(rawMtmIntraday)
    ? rawMtmIntraday
    : 0;
  const _m6 = {
    realizedToday,
    mtmOvernight,
    mtmIntradayOpen,
    warnings: Array.isArray(input?._m6?.warnings)
      ? input._m6.warnings.filter(
          (msg: unknown): msg is string =>
            typeof msg === "string" && msg.length > 0,
        )
      : [],
  };
  const M7 = normalizeCounts(input?.M7 ?? {});
  const M8 = normalizeCounts(input?.M8 ?? {});
  const M9 = Number(
    input?.M9 ?? input?.realized ?? input?.aux?.m6PrevRealizedTotal ?? 0,
  );
  const M10 = normalizeWinLoss(input?.M10 ?? {});
  const m6Legs = Array.isArray(input?.aux?.m6Legs)
    ? input.aux.m6Legs
        .map((leg: any) => {
          if (!leg || typeof leg.symbol !== "string") return undefined;
          const qty = Number(leg.qty);
          const basis = Number.isFinite(Number(leg.basis))
            ? Number(leg.basis)
            : Number(leg.prevClose);
          const mark = Number.isFinite(Number(leg.mark))
            ? Number(leg.mark)
            : Number(leg.priceNow);
          const amount = Number.isFinite(Number(leg.amount))
            ? Number(leg.amount)
            : Number(leg.mtm);
          if (
            !Number.isFinite(qty) ||
            !Number.isFinite(basis) ||
            !Number.isFinite(mark) ||
            !Number.isFinite(amount)
          ) {
            return undefined;
          }
          const component =
            leg.component === "realized_today" ||
            leg.component === "mtm_overnight" ||
            leg.component === "mtm_intraday_open"
              ? leg.component
              : undefined;
          const direction =
            leg.direction === "long" || leg.direction === "short"
              ? leg.direction
              : undefined;
          return {
            symbol: leg.symbol,
            qty,
            basis,
            mark,
            amount,
            component,
            ...(direction ? { direction } : {}),
          };
        })
        .filter((leg: any): leg is {
          symbol: string;
          qty: number;
          basis: number;
          mark: number;
          amount: number;
          component?: "realized_today" | "mtm_overnight" | "mtm_intraday_open";
          direction?: "long" | "short";
        } => Boolean(leg))
    : undefined;
  const m6Excluded = Array.isArray(input?.aux?.m6Excluded)
    ? input.aux.m6Excluded.filter(
        (row: any) =>
          row &&
          typeof row.symbol === "string" &&
          (row.reason === "MISSING_PREV_CLOSE" ||
            row.reason === "MISSING_MARK"),
      )
    : undefined;
  const missingPrevCloseSymbols = Array.isArray(
    input?.aux?.missingPrevCloseSymbols,
  )
    ? input.aux.missingPrevCloseSymbols
    .map((s: unknown) => (typeof s === "string" ? s.trim().toUpperCase() : ""))
    .filter((s: string) => s.length > 0)
    : [];
  const rawBreakdown = input?.aux?.breakdown;
  const breakdown = rawBreakdown
    ? Array.isArray(rawBreakdown)
      ? {
          all: rawBreakdown.map((row) => ({ ...(row ?? {}) })),
          m4: rawBreakdown
            .filter((row: any) => row?.into === "M4")
            .map((row: any) => ({ ...(row ?? {}) })),
          m5_1: rawBreakdown
            .filter((row: any) => row?.into === "M5.1")
            .map((row: any) => ({ ...(row ?? {}) })),
          m5_2: rawBreakdown
            .filter((row: any) => row?.into === "M5.2")
            .map((row: any) => ({ ...(row ?? {}) })),
        }
      : {
          all: Array.isArray((rawBreakdown as any).all)
            ? (rawBreakdown as any).all.map((row: any) => ({ ...(row ?? {}) }))
            : [],
          m4: Array.isArray((rawBreakdown as any).m4)
            ? (rawBreakdown as any).m4.map((row: any) => ({ ...(row ?? {}) }))
            : [],
          m5_1: Array.isArray((rawBreakdown as any).m5_1)
            ? (rawBreakdown as any).m5_1.map((row: any) => ({ ...(row ?? {}) }))
            : [],
          m5_2: Array.isArray((rawBreakdown as any).m5_2)
            ? (rawBreakdown as any).m5_2.map((row: any) => ({ ...(row ?? {}) }))
            : [],
        }
    : undefined;
  const normalizeOfficialEntries = (source: any[]): MissingOfficialCloseEntry[] =>
    source
      .map((entry) => {
        const symbol =
          typeof entry?.symbol === "string"
            ? entry.symbol.trim().toUpperCase()
            : "";
        const rawDate =
          typeof entry?.date === "string" ? entry.date.slice(0, 10) : "";
        if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          return null;
        }
        const purposes = Array.isArray(entry?.purposes)
          ? (Array.from(
              new Set(
                entry.purposes.filter(
                  (value: unknown): value is string =>
                    typeof value === "string" && value.trim().length > 0,
                ),
              ),
            ) as string[]).sort((a, b) => a.localeCompare(b))
          : [];
        const impact = Array.isArray(entry?.impact)
          ? (Array.from(
              new Set(
                entry.impact.filter(
                  (value: unknown): value is string =>
                    typeof value === "string" && value.trim().length > 0,
                ),
              ),
            ) as string[]).sort((a, b) => a.localeCompare(b))
          : [];
        const hasFallback = Boolean(entry?.hasFallback);
        const firstDetectedAt =
          typeof entry?.firstDetectedAt === "string"
            ? entry.firstDetectedAt
            : undefined;
        const lastDetectedAt =
          typeof entry?.lastDetectedAt === "string"
            ? entry.lastDetectedAt
            : undefined;
        return {
          symbol,
          date: rawDate,
          purposes,
          impact,
          hasFallback,
          ...(firstDetectedAt ? { firstDetectedAt } : {}),
          ...(lastDetectedAt ? { lastDetectedAt } : {}),
        };
      })
      .filter((entry): entry is MissingOfficialCloseEntry => Boolean(entry))
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return a.symbol.localeCompare(b.symbol);
      });
  const normalizedMissingOfficial = Array.isArray(
    input?.diagnostics?.missingOfficialCloses,
  )
    ? normalizeOfficialEntries(input.diagnostics.missingOfficialCloses as any[])
    : [];
  const normalizedPendingOfficial = Array.isArray(
    input?.diagnostics?.pendingOfficialCloses,
  )
    ? normalizeOfficialEntries(input.diagnostics.pendingOfficialCloses as any[])
    : [];
  const normalizedM4Today: M4TodayDetail = (() => {
    const raw = input?.M4_today;
    const realizedComponent = Number.isFinite(Number(raw?.realized))
      ? Number(raw?.realized)
      : realizedToday;
    const overnightComponent = Number.isFinite(Number(raw?.mtmOvernight))
      ? Number(raw?.mtmOvernight)
      : mtmOvernight;
    const intradayComponent = Number.isFinite(Number(raw?.mtmIntradayOpen))
      ? Number(raw?.mtmIntradayOpen)
      : mtmIntradayOpen;
    const totalComponent = Number.isFinite(Number(raw?.total))
      ? Number(raw?.total)
      : realizedComponent + overnightComponent + intradayComponent;
    const degradedFlag =
      typeof raw?.degraded === "boolean"
        ? raw.degraded
        : missingPrevCloseSymbols.length > 0;
    const reason =
      raw?.reason === "missing_official_close_prev" || degradedFlag
        ? ("missing_official_close_prev" as const)
        : undefined;
    return {
      total: totalComponent,
      realized: realizedComponent,
      mtmOvernight: overnightComponent,
      mtmIntradayOpen: intradayComponent,
      degraded: Boolean(degradedFlag),
      ...(reason ? { reason } : {}),
    };
  })();
  const aux = {
    breakdown,
    m6PriceChange: priceChange,
    m6PrevRealizedTotal:
      typeof prevRealized === "number" && Number.isFinite(prevRealized)
        ? prevRealized
        : undefined,
    m6FifoToday:
      typeof fifoToday === "number" && Number.isFinite(fifoToday)
        ? fifoToday
        : undefined,
    realized:
      Number.isFinite(realizedToday) || Number.isFinite(realizedIntraday)
        ? {
            today_intraday: realizedIntraday,
            today_total: realizedToday,
          }
        : undefined,
    m6Legs,
    m6Excluded,
    missingPrevCloseSymbols,
  };
  const normalizedDiagnostics =
    normalizedMissingOfficial.length > 0 || normalizedPendingOfficial.length > 0
      ? {
          ...(normalizedMissingOfficial.length > 0
            ? { missingOfficialCloses: normalizedMissingOfficial }
            : {}),
          ...(normalizedPendingOfficial.length > 0
            ? { pendingOfficialCloses: normalizedPendingOfficial }
            : {}),
        }
      : undefined;
  const normalizedPeriodMeta =
    input?._period && typeof input._period === "object"
      ? {
          ...input._period,
          ...(input._period?.degraded &&
          typeof input._period.degraded === "object"
            ? { degraded: { ...input._period.degraded } }
            : {}),
          ...(input._period?.status && typeof input._period.status === "object"
            ? { status: { ...input._period.status } }
            : {}),
          ...(input._period?.breakdown &&
          typeof input._period.breakdown === "object"
            ? {
                breakdown: Object.fromEntries(
                  Object.entries(
                    input._period.breakdown as Record<string, any>,
                  ).map(([key, value]) => [
                    key,
                    value && typeof value === "object" ? { ...value } : value,
                  ]),
                ),
              }
            : {}),
          ...(input._period?.diagnostics &&
          typeof input._period.diagnostics === "object"
            ? {
                diagnostics: Object.fromEntries(
                  Object.entries(
                    input._period.diagnostics as Record<string, any>,
                  ).map(([key, value]) => [
                    key,
                    value && typeof value === "object" ? { ...value } : value,
                  ]),
                ),
              }
            : {}),
        }
      : undefined;

  const parseFiniteNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  };

  const pickPeriodNumber = (...candidates: unknown[]) => {
    for (const candidate of candidates) {
      const parsed = parseFiniteNumber(candidate);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return undefined;
  };

  const periodSource = (input as { periods?: Record<string, unknown> })?.periods ?? {};

  const M11 = pickPeriodNumber(input?.M11, periodSource["M11"]);
  const M12 = pickPeriodNumber(input?.M12, periodSource["M12"]);
  const M13 = pickPeriodNumber(input?.M13, periodSource["M13"]);

  return {
    M1,
    M2,
    M3,
    M4,
    M4_today: normalizedM4Today,
    M5,
    M6,
    _m6,
    M7,
    M8,
    M9,
    M10,
    ...(M11 !== undefined ? { M11 } : {}),
    ...(M12 !== undefined ? { M12 } : {}),
    ...(M13 !== undefined ? { M13 } : {}),
    aux,
    ...(normalizedPeriodMeta ? { _period: normalizedPeriodMeta } : {}),
    ...(normalizedDiagnostics ? { diagnostics: normalizedDiagnostics } : {}),
  };
}

// 兼容监控的扁平投影（监控/脚本可能用到）
export function projectToM6(input: any) {
  const m = normalizeMetrics(input);
  return { M3: m.M3, M4: m.M4, M5_2: m.M5.fifo, M6: m.M6.total };
}
