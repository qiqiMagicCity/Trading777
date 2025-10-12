// ⚠️ 警示：严禁在此文件外将 `DailyResultInput` 形态直接传给 `calcMetricsInternal`
//       runAllCore 会在第一时间归一化字符串/空值，确保后续调用始终是纯数值。
import type { InitialPosition } from "./fifo";
import type { Trade, Position } from "./services/dataService";
import { calcMetrics, reuseCalcMetricsFromCache } from "./metrics";
import { createM4TodayDetail } from "./m4Today";
import { computePeriods } from "./metrics-periods";
import { generateDailyResults } from "./dailyResults";
import { tsFromYmdAtNoonUTC } from "./nyParse";
import {
  nyDateStr,
  nyDateStrSafe,
  startOfMonthNY,
  startOfWeekNY,
  startOfYearNY,
  toNY,
  isSameTradingDayNY,
} from "./time";
import type { DailyResult } from "./types";
import { resolveTradingDateStr } from "./tradingDay";
import { MoneyDecimal as Decimal, round2 } from "./money";
import { buildEnrichedTrades, replayPortfolio } from "./tradeReplay";
import type { IoProvider } from "./io/providers";
import { assertSchema } from "./schemas/assertSchema";
import { Trades, Positions, PriceMap, DailyResults } from "./schemas/real";
import {
  parseSnapshotNumber,
  type SnapshotFieldParseError,
  type SnapshotNumericField,
} from "./snapshotNumber";

let cachedFs: typeof import("fs") | null = null;
let cachedPath: typeof import("path") | null = null;
type MonitorModule = {
  assertM6Equality: (result: unknown) => void;
  assertNoOverClose: (enriched: unknown) => void;
  assertLotConservation: (positions: InitialPosition[], enriched: unknown) => void;
  assertNoNegativeLots: (enriched: unknown) => void;
  snapshotArtifacts: (
    input: {
      initialPositions: InitialPosition[];
      rawTrades: RawTrade[];
      closePrices: ClosePriceMap;
      dailyResults: MinimalDailyResult[];
    },
    result: unknown,
  ) => void;
};
let cachedMonitor: MonitorModule | null = null;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_ISO_RE =
  /^(\d{4}-\d{2}-\d{2})(?:[T\s])?00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})?$/i;

function dateFromDateLike(value: unknown): Date | null {
  if (typeof value === "string") {
    const midnightMatch = MIDNIGHT_ISO_RE.exec(value);
    if (midnightMatch) {
      try {
        return new Date(tsFromYmdAtNoonUTC(midnightMatch[1]!));
      } catch {
        return new Date(Number.NaN);
      }
    }
    if (DATE_ONLY_RE.test(value)) {
      try {
        return new Date(tsFromYmdAtNoonUTC(value));
      } catch {
        return new Date(Number.NaN);
      }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function tsFromDateLike(value: unknown): number {
  const parsed = dateFromDateLike(value);
  return parsed ? parsed.getTime() : Number.NaN;
}

async function loadFs() {
  if (typeof window !== "undefined") {
    throw new Error("fs module is not available in the browser");
  }
  if (!cachedFs) {
    const nodeRequire = eval("require") as (module: string) => unknown;
    cachedFs = nodeRequire("fs") as typeof import("fs");
  }
  return cachedFs;
}

async function loadPath() {
  if (typeof window !== "undefined") {
    throw new Error("path module is not available in the browser");
  }
  if (!cachedPath) {
    const nodeRequire = eval("require") as (module: string) => unknown;
    cachedPath = nodeRequire("path") as typeof import("path");
  }
  return cachedPath;
}

async function loadMonitor(): Promise<MonitorModule> {
  if (typeof window !== "undefined") {
    throw new Error("monitor helpers are not available in the browser");
  }
  if (!cachedMonitor) {
    const nodeRequire = eval("require") as (module: string) => unknown;
    const moduleName = ["./mon", "itor"].join("");
    cachedMonitor = nodeRequire(moduleName) as MonitorModule;
  }
  return cachedMonitor;
}

async function readJsonSafe<T>(relName: string, fallback: T): Promise<T> {
  const pathModule = await loadPath();
  const fs = await loadFs();
  const candidates = [
    pathModule.join(process.cwd(), "apps", "web", "public", relName),
    pathModule.join(process.cwd(), "public", relName),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.promises.readFile(candidate, "utf8");
      const parsed = JSON.parse(raw || "null");
      if (parsed !== null && parsed !== undefined) {
        return parsed as T;
      }
      return fallback;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  return fallback;
}

/**
 * 从 public 中的 prices.json 与 trades.json 读取日期集合，
 * 与传入区间取交集并去重排序。
 *
 * @param from 起始日期（含）
 * @param to   结束日期（含）
 * @param tradesOpt 可选：直接传入的原始成交数组，测试用
 * @param pricesOpt 可选：直接传入的收盘价映射，测试用
 */
export function getReplayDays(
  from: string,
  to: string,
  tradesOpt?: RawTrade[],
  pricesOpt?: any,
): string[] {
  const trades = tradesOpt ?? [];
  const prices = normalizeClosePriceMap(
    pricesOpt ?? {},
  );
  const within = (d: string) => (!from || d >= from) && (!to || d <= to);
  const set = new Set<string>();
  for (const sym of Object.keys(prices)) {
    const byDate = prices[sym] || {};
    for (const d of Object.keys(byDate)) {
      if (within(d)) set.add(d);
    }
  }
  for (const t of trades) {
    const d = nyDateStrSafe(t.date);
    if (within(d)) set.add(d);
  }
  return Array.from(set).sort();
}

type IoRunAllInput = {
  ioProvider: IoProvider;
  baseUrl?: string;
  evalDateStr?: string;
};

function isIoRunAllInput(value: unknown): value is IoRunAllInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IoRunAllInput>;
  return Boolean(candidate.ioProvider);
}

export async function runAll(...args: unknown[]) {
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    Array.isArray((args[0] as { symbols?: unknown }).symbols)
  ) {
    const { from } = args[0] as { symbols: string[]; from: string; to: string };
    const trades = assertSchema(await readJsonSafe("trades.json", [] as RawTrade[]), Trades) as RawTrade[];
    const positions = assertSchema(await readJsonSafe("positions.json", [] as InitialPosition[]), Positions);
    const pricesMap = await readJsonSafe("prices.json", {} as Record<string, unknown>);
    const prices = normalizeClosePriceMap(assertSchema(pricesMap, PriceMap));
    const daily = assertSchema(
      await readJsonSafe("dailyResult.json", [] as MinimalDailyResult[]),
      DailyResults,
    );
    return runAllCore(from, positions, trades, prices, { dailyResults: daily }, { evalDate: from });
  }
  if (args.length === 1 && isIoRunAllInput(args[0])) {
    const { ioProvider, baseUrl, evalDateStr } = args[0];
    const [tradesRaw, positionsRaw, dailyRaw, pricesRaw] = await Promise.all([
      ioProvider.loadTrades(baseUrl),
      ioProvider.loadPositions(baseUrl),
      ioProvider.loadDailyResults(baseUrl),
      ioProvider.loadClosePrices ? ioProvider.loadClosePrices(baseUrl) : undefined,
    ]);

    const normalizeTrade = (entry: unknown): RawTrade | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const sideRaw = record.side ?? record.action;
      const symbolRaw = record.symbol;
      const priceRaw = record.price;
      const qtyRaw = record.qty ?? record.quantity;
      const dateRaw = record.date ?? record.time;
      if (
        typeof sideRaw !== "string" ||
        typeof symbolRaw !== "string" ||
        !Number.isFinite(Number(priceRaw)) ||
        !Number.isFinite(Number(qtyRaw)) ||
        typeof dateRaw !== "string"
      ) {
        return null;
      }
      return {
        side: sideRaw.toUpperCase() as RawTrade["side"],
        symbol: symbolRaw.toUpperCase(),
        price: Number(priceRaw),
        qty: Number(qtyRaw),
        date: String(dateRaw),
      };
    };

    const normalizePosition = (entry: unknown): InitialPosition | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const symbolRaw = record.symbol;
      const qtyRaw = record.qty ?? record.quantity;
      const avgPriceRaw = record.avgPrice ?? record.price;
      if (
        typeof symbolRaw !== "string" ||
        !Number.isFinite(Number(qtyRaw)) ||
        !Number.isFinite(Number(avgPriceRaw))
      ) {
        return null;
      }
      return {
        symbol: symbolRaw.toUpperCase(),
        qty: Number(qtyRaw),
        avgPrice: Number(avgPriceRaw),
      };
    };

    const rawTradesSource = Array.isArray((tradesRaw as any)?.trades)
      ? (tradesRaw as any).trades
      : tradesRaw;

    const trades = (Array.isArray(rawTradesSource) ? rawTradesSource : [])
      .map((entry) => normalizeTrade(entry))
      .filter((entry): entry is RawTrade => entry !== null);

    const positions = (Array.isArray(positionsRaw) ? positionsRaw : [])
      .map((entry) => normalizePosition(entry))
      .filter((entry): entry is InitialPosition => entry !== null);

    const priceSource = pricesRaw ?? {};
    const closePrices = normalizeClosePriceMap(priceSource);

    const dailyResults = Array.isArray(dailyRaw)
      ? (dailyRaw as MinimalDailyResult[])
      : Array.isArray((dailyRaw as any)?.rows)
      ? ((dailyRaw as any).rows as MinimalDailyResult[])
      : [];

    const evalISO = (() => {
      if (typeof evalDateStr === "string" && evalDateStr.trim()) {
        return evalDateStr;
      }
      if (dailyResults.length > 0) {
        const last = dailyResults[dailyResults.length - 1];
        if (last?.date && typeof last.date === "string") {
          return last.date;
        }
      }
      if (trades.length > 0) {
        const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
        const lastTrade = sorted[sorted.length - 1];
        if (lastTrade?.date) {
          return nyDateStrSafe(lastTrade.date);
        }
      }
      return nyDateStrSafe(new Date().toISOString());
    })();

    return runAllCore(
      evalISO,
      positions as InitialPosition[],
      trades as RawTrade[],
      closePrices,
      { dailyResults },
      { evalDate: evalISO },
    );
  }
  return runAllCore(...(args as Parameters<typeof runAllCore>));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type RawTrade = {
  date: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  symbol: string;
  qty: number;
  price: number;
};

export type ClosePriceMap = Record<string, Record<string, number>>; // symbol -> { date: price }

export function normalizeClosePriceMap(input: any): ClosePriceMap {
  const out: ClosePriceMap = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      const date = k;
      const mp = v as Record<string, number>;
      for (const [sym, price] of Object.entries(mp)) {
        (out[sym] ??= {})[date] = Number(price);
      }
    } else {
      out[k] = v as Record<string, number>;
    }
  }
  return out;
}

// --- M5/M4 计算核心工具 ---
type Lot = {
  qty: number;
  cost: number;
  isToday: boolean;
  openPrice: number;
  time: string;
  lotDateStr: string;
  from: "history" | "today";
};
type ConsumeRow = {
  qty: number;
  cost: number;
  isToday: boolean;
  openPrice: number;
  time: string;
  lotDateStr: string;
  from: "history" | "today";
};

type BreakdownLeg = {
  symbol: string;
  time: string;
  action: "SELL" | "COVER";
  into: "M4" | "M5.1" | "M5.2";
  qty: number;
  openPrice?: number;
  fifoCost?: number;
  closePrice: number;
  lotTag: "T" | "H";
  lotDateStr: string;
  from: "history" | "today";
  isToday: boolean;
  pnl_raw: number;
  pnl: number;
  fillId: string;
};

type BreakdownBuckets = {
  all: BreakdownLeg[];
  m4: BreakdownLeg[];
  m5_1: BreakdownLeg[];
  m5_2: BreakdownLeg[];
};

function realizedPnLLongRaw(closePrice: number, costPrice: number, qty: number): number {
  return new Decimal(closePrice).minus(costPrice).mul(qty).toNumber();
}

function realizedPnLShortRaw(costPrice: number, coverPrice: number, qty: number): number {
  return new Decimal(costPrice).minus(coverPrice).mul(qty).toNumber();
}
type SymState = {
  longLots: Lot[]; // BUY 队列（含历史 + 当日）
  shortLots: Lot[]; // SHORT 队列（含历史 + 当日）
  behLong: Lot[]; // 当日 BUY 行为栈
  behShort: Lot[]; // 当日 SHORT 行为栈
};

function computeBaselineDate(rawTrades: RawTrade[], fallbackISO: string): string {
  let minTime = Number.POSITIVE_INFINITY;
  for (const t of rawTrades) {
    const parsed = dateFromDateLike(t.date);
    const time = parsed ? parsed.getTime() : Number.NaN;
    if (Number.isFinite(time) && time < minTime) {
      minTime = time;
    }
  }
  if (!Number.isFinite(minTime)) {
    const fallback = toNY(`${fallbackISO}T00:00:00Z`);
    fallback.setDate(fallback.getDate() - 1);
    return nyDateStr(fallback);
  }
  const base = toNY(minTime);
  base.setDate(base.getDate() - 1);
  return nyDateStr(base);
}

function fifoPreview(lots: Lot[], qty: number): ConsumeRow[] {
  const rows: ConsumeRow[] = [];
  let need = qty;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(need, lot.qty);
    if (take > 0)
      rows.push({
        qty: take,
        cost: lot.cost,
        isToday: lot.isToday,
        openPrice: lot.openPrice,
        time: lot.time,
        lotDateStr: lot.lotDateStr,
        from: lot.from,
      });
    need -= take;
  }
  return rows;
}

function fifoApply(lots: Lot[], preview: ConsumeRow[]): void {
  let i = 0,
    j = 0;
  const wants = preview.map((r) => ({ ...r }));
  while (i < lots.length && j < wants.length) {
    const want = wants[j]!;
    if (want.qty <= 0) {
      j++;
      continue;
    }
    const lot = lots[i]!;
    const can = Math.min(lot.qty, want.qty);
    lot.qty -= can;
    want.qty -= can;
    if (lot.qty === 0) {
      lots.splice(i, 1);
    } else {
      i++;
    }
    if (want.qty === 0) j++;
  }
}

function behAvail(stack: Lot[]): number {
  return stack.reduce((s, x) => s + x.qty, 0);
}

function behConsume(stack: Lot[], qty: number): ConsumeRow[] {
  const rows: ConsumeRow[] = [];
  let need = qty;
  for (let i = 0; i < stack.length && need > 0; i++) {
    const lot = stack[i]!;
    const take = Math.min(need, lot.qty);
    if (take > 0) {
      rows.push({
        qty: take,
        cost: lot.cost,
        isToday: true,
        openPrice: lot.openPrice,
        time: lot.time,
        lotDateStr: lot.lotDateStr,
        from: lot.from,
      });
      lot.qty -= take;
      need -= take;
    }
    if (lot.qty === 0) {
      stack.splice(i, 1);
      i--;
    }
  }
  return rows;
}

function takeQty(rows: ConsumeRow[], need: number): ConsumeRow[] {
  const out: ConsumeRow[] = [];
  let left = need;
  for (const r of rows) {
    if (left <= 0) break;
    const t = Math.min(left, r.qty);
    if (t > 0) out.push({ ...r, qty: t });
    left -= t;
  }
  return out;
}

let bySym: Record<string, SymState> = {};
function getSym(sym: string): SymState {
  return bySym[sym] ?? (bySym[sym] = { longLots: [], shortLots: [], behLong: [], behShort: [] });
}

const breakdownBuckets: BreakdownBuckets = {
  all: [],
  m4: [],
  m5_1: [],
  m5_2: [],
};
let M4_raw = 0;
let M5_1_raw = 0;
let M5_2_raw = 0;

const breakdownBucketKey = {
  M4: "m4",
  "M5.1": "m5_1",
  "M5.2": "m5_2",
} as const;

function recordLeg(into: BreakdownLeg["into"], leg: Omit<BreakdownLeg, "into">) {
  const full: BreakdownLeg = { ...leg, into };
  breakdownBuckets.all.push(full);
  const bucket = breakdownBucketKey[into];
  breakdownBuckets[bucket].push(full);
  return full;
}

function postM4_Long(row: ConsumeRow, sellPrice: number, sym: string, time: string, fillId: string) {
  const pnlRaw = realizedPnLLongRaw(sellPrice, row.cost, row.qty);
  M4_raw += pnlRaw;
  recordLeg("M4", {
    symbol: sym,
    time,
    action: "SELL",
    qty: row.qty,
    closePrice: sellPrice,
    fifoCost: row.cost,
    lotTag: "H",
    lotDateStr: row.lotDateStr,
    from: "history",
    isToday: row.isToday,
    pnl_raw: pnlRaw,
    pnl: round2(pnlRaw),
    fillId,
  });
}

function postM4_Short(row: ConsumeRow, coverPrice: number, sym: string, time: string, fillId: string) {
  const pnlRaw = realizedPnLShortRaw(row.cost, coverPrice, row.qty);
  M4_raw += pnlRaw;
  recordLeg("M4", {
    symbol: sym,
    time,
    action: "COVER",
    qty: row.qty,
    closePrice: coverPrice,
    fifoCost: row.cost,
    lotTag: "H",
    lotDateStr: row.lotDateStr,
    from: "history",
    isToday: row.isToday,
    pnl_raw: pnlRaw,
    pnl: round2(pnlRaw),
    fillId,
  });
}

function postM5_Long(
  todayLots: ConsumeRow[],
  fifoRows: ConsumeRow[],
  sellPrice: number,
  sym: string,
  time: string,
  fillId: string,
) {
  for (const r of todayLots) {
    const pnlRaw = realizedPnLLongRaw(sellPrice, r.openPrice, r.qty);
    M5_1_raw += pnlRaw;
    recordLeg("M5.1", {
      symbol: sym,
      time,
      action: "SELL",
      qty: r.qty,
      closePrice: sellPrice,
      openPrice: r.openPrice,
      lotTag: "T",
      lotDateStr: r.lotDateStr,
      from: "today",
      isToday: true,
      pnl_raw: pnlRaw,
      pnl: round2(pnlRaw),
      fillId,
    });
  }
  const fifoToday = takeQty(
    fifoRows.filter((x) => x.isToday),
    todayLots.reduce((s, x) => s + x.qty, 0),
  );
  for (const r of fifoToday) {
    const pnlRaw = realizedPnLLongRaw(sellPrice, r.cost, r.qty);
    M5_2_raw += pnlRaw;
    recordLeg("M5.2", {
      symbol: sym,
      time,
      action: "SELL",
      qty: r.qty,
      closePrice: sellPrice,
      fifoCost: r.cost,
      lotTag: "T",
      lotDateStr: r.lotDateStr,
      from: "today",
      isToday: true,
      pnl_raw: pnlRaw,
      pnl: round2(pnlRaw),
      fillId,
    });
  }
}

function postM5_Short(
  todayLots: ConsumeRow[],
  fifoRows: ConsumeRow[],
  coverPrice: number,
  sym: string,
  time: string,
  fillId: string,
) {
  for (const r of todayLots) {
    const pnlRaw = realizedPnLShortRaw(r.openPrice, coverPrice, r.qty);
    M5_1_raw += pnlRaw;
    recordLeg("M5.1", {
      symbol: sym,
      time,
      action: "COVER",
      qty: r.qty,
      closePrice: coverPrice,
      openPrice: r.openPrice,
      lotTag: "T",
      lotDateStr: r.lotDateStr,
      from: "today",
      isToday: true,
      pnl_raw: pnlRaw,
      pnl: round2(pnlRaw),
      fillId,
    });
  }
  const fifoToday = takeQty(
    fifoRows.filter((x) => x.isToday),
    todayLots.reduce((s, x) => s + x.qty, 0),
  );
  for (const r of fifoToday) {
    const pnlRaw = realizedPnLShortRaw(r.cost, coverPrice, r.qty);
    M5_2_raw += pnlRaw;
    recordLeg("M5.2", {
      symbol: sym,
      time,
      action: "COVER",
      qty: r.qty,
      closePrice: coverPrice,
      fifoCost: r.cost,
      lotTag: "T",
      lotDateStr: r.lotDateStr,
      from: "today",
      isToday: true,
      pnl_raw: pnlRaw,
      pnl: round2(pnlRaw),
      fillId,
    });
  }
}

/**
 * 统一评估日优先级：
 * 1) opts.evalDate（推荐显式传入）
 * 2) 环境冻结日：NEXT_PUBLIC_FREEZE_DATE / FREEZE_DATE（兼容旧脚本/CI）
 * 3) 函数入参 _date（旧调用方式）
 * 4) 系统当前时间 new Date()
 *
 * 为兼容旧版 calcMetrics/调试函数里对“今天”的判定：
 * 在本函数调用范围内临时设置 process.env.NEXT_PUBLIC_FREEZE_DATE=evalISO，完成后恢复。
 */
type MinimalDailyResult = {
  date?: string;
  realized?: number | string | null;
  unrealized?: number | string | null;
  unrealizedDelta?: number | string | null;
  realized_today?: number | string | null;
};

type NormalizedDailyRow = {
  day: string;
  realized: number;
  unrealized?: number;
  unrealizedDelta?: number;
  parseErrors?: SnapshotFieldParseError[];
  sourceDate?: string;
};

type NumericDailyResult = DailyResult & { parseErrors?: SnapshotFieldParseError[] };

export function normalizeDailyRows(
  daily: MinimalDailyResult[] | undefined,
  evalISO: string,
): NormalizedDailyRow[] {
  if (!Array.isArray(daily) || daily.length === 0) return [];

  const dedup = new Map<
    string,
    {
      row: NormalizedDailyRow;
      ts: number;
    }
  >();

  for (const entry of daily) {
    if (!entry?.date) continue;
    const day = nyDateStrSafe(entry.date);
    if (day > evalISO) continue;

    const tsCandidate = tsFromDateLike(entry.date);
    const ts = Number.isFinite(tsCandidate) ? tsCandidate : -Infinity;
    const parseErrors: SnapshotFieldParseError[] = [];

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
      parseErrors.push({ ...parsed.error, field, day });
      return undefined;
    };

    const realizedValue = parseField("realized", entry.realized);
    const normalized: NormalizedDailyRow = {
      day,
      realized: realizedValue ?? 0,
      sourceDate: entry.date,
    };

    const unrealizedValue = parseField("unrealized", entry.unrealized);
    if (typeof unrealizedValue === "number") {
      normalized.unrealized = unrealizedValue;
    }

    const unrealizedDeltaValue = parseField(
      "unrealizedDelta",
      entry.unrealizedDelta,
      { optional: true },
    );
    if (typeof unrealizedDeltaValue === "number") {
      normalized.unrealizedDelta = unrealizedDeltaValue;
    }

    if (parseErrors.length > 0) {
      normalized.parseErrors = parseErrors;
    }

    const prev = dedup.get(day);
    if (!prev || ts >= prev.ts) {
      dedup.set(day, { row: normalized, ts });
    }
  }

  return Array.from(dedup.values())
    .sort((a, b) => {
      if (a.row.day < b.row.day) return -1;
      if (a.row.day > b.row.day) return 1;
      return a.ts - b.ts;
    })
    .map(({ row }) => row);
}

function needsSyntheticDailyResults(
  rows: NormalizedDailyRow[],
  evalISO: string,
): boolean {
  if (rows.length === 0) {
    return true;
  }

  const last = rows[rows.length - 1]!;
  if (last.day !== evalISO) {
    return true;
  }

  const windows = [
    nyDateStr(startOfWeekNY(evalISO)),
    nyDateStr(startOfMonthNY(evalISO)),
    nyDateStr(startOfYearNY(evalISO)),
  ];

  for (const start of windows) {
    const windowRows = rows.filter((row) => row.day >= start);
    if (windowRows.length === 0) {
      return true;
    }
  }

  return false;
}

/**
 * runAllCore 接受 MinimalDailyResult 输入形态（可包含字符串/空值），
 * 但在函数开头即通过 normalizeDailyRows 归一化为纯数值 DailyResult[]，
 * 后续 calcMetrics / computePeriods 全程只处理数值形态快照。
 */
async function runAllCore(
  _date: string,
  initialPositions: InitialPosition[],
  rawTrades: RawTrade[],
  closePrices: ClosePriceMap,
  input: { dailyResults?: MinimalDailyResult[] } = {},
  opts: { evalDate?: Date | string } = {},
) {
  // ---- 评估日统一 ----
  const envFreeze = process?.env?.NEXT_PUBLIC_FREEZE_DATE || process?.env?.FREEZE_DATE || "";
  const evalDateInput: Date | string =
    (opts as any)?.evalDate ?? (envFreeze || _date) ?? new Date();
  const evalISO = resolveTradingDateStr(evalDateInput);

  // ---- trades 规范化并通过交易回放构建基线 ----
  const trades: Trade[] = rawTrades.map((t) => ({
    symbol: t.symbol,
    price: t.price,
    quantity: t.qty,
    date: t.date,
    action: t.side.toLowerCase() as Trade["action"],
  }));

  const baselineDate = computeBaselineDate(rawTrades, evalISO);
  const baselineTrades: Trade[] = [];
  for (const pos of initialPositions) {
    if (!pos.symbol || !Number.isFinite(pos.qty) || pos.qty === 0) continue;
    const qtyAbs = Math.abs(pos.qty);
    const isShort = pos.qty < 0;
    baselineTrades.push({
      symbol: pos.symbol,
      price: pos.avgPrice,
      quantity: isShort ? -qtyAbs : qtyAbs,
      date: `${baselineDate}T00:00:00Z`,
      action: isShort ? "short" : "buy",
      isInitialPosition: true,
    });
  }

  const replay = replayPortfolio([...baselineTrades, ...trades]);
  const enriched = buildEnrichedTrades(replay.baseline);
  const baselinePositions = replay.baseline.initialPositions;

  const resolvePrevClose = (symbol: string): number | undefined => {
    const byDate = closePrices[symbol];
    if (!byDate) return undefined;
    let candidate: string | null = null;
    for (const [date, price] of Object.entries(byDate)) {
      if (!Number.isFinite(price)) continue;
      if (date >= evalISO) continue;
      if (!candidate || date > candidate) {
        candidate = date;
      }
    }
    if (!candidate) return undefined;
    const price = byDate[candidate];
    return Number.isFinite(price) ? price : undefined;
  };

  const positions: Position[] = replay.positions.map((pos) => {
    const last = closePrices[pos.symbol]?.[evalISO];
    return {
      ...pos,
      last: last ?? pos.avgPrice,
      priceOk: last !== undefined,
      stale: last === undefined,
      prevClose: resolvePrevClose(pos.symbol),
    };
  });

  // ---- 兼容旧 calcMetrics 对“今天”判断：作用域内临时设置 FREEZE_DATE ----
  const prevFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
  process.env.NEXT_PUBLIC_FREEZE_DATE = evalISO;

  const providedDaily = Array.isArray(input.dailyResults)
    ? (input.dailyResults as MinimalDailyResult[])
    : [];
  const normalizedDailyRows = normalizeDailyRows(providedDaily, evalISO);

  const shouldRebuildDaily = needsSyntheticDailyResults(normalizedDailyRows, evalISO);

  const normalizedDailyResults: NumericDailyResult[] = normalizedDailyRows.map((row) => {
    const baseDate = row.sourceDate ?? `${row.day}T12:00:00Z`;
    const normalized: NumericDailyResult = {
      date: baseDate,
      realized: Number.isFinite(row.realized) ? row.realized : 0,
      unrealized:
        typeof row.unrealized === "number" && Number.isFinite(row.unrealized)
          ? row.unrealized
          : 0,
      ...(typeof row.unrealizedDelta === "number" && Number.isFinite(row.unrealizedDelta)
        ? { unrealizedDelta: row.unrealizedDelta }
        : {}),
    };

    if (row.parseErrors?.length) {
      normalized.parseErrors = row.parseErrors.map((err) => ({ ...err }));
    }

    return normalized;
  });

  const effectiveDailyResults: DailyResult[] = shouldRebuildDaily
    ? generateDailyResults({
        trades: enriched,
        positions,
        closePrices,
        evalDate: evalISO,
      })
    : normalizedDailyResults;

  if (shouldRebuildDaily) {
    console.warn(
      `[runAll] regenerated dailyResults for ${evalISO} due to insufficient baseline coverage`,
    );
  }

  let metrics = reuseCalcMetricsFromCache(
    enriched,
    positions,
    effectiveDailyResults,
    {
      tradingDateStr: evalISO,
      periodEvalYmd: evalISO,
      officialCloseMap: closePrices,
    },
  );
  try {
    if (!metrics) {
      metrics = calcMetrics(enriched, positions, effectiveDailyResults, {
        tradingDateStr: evalISO,
        periodEvalYmd: evalISO,
        officialCloseMap: closePrices,
      });
    }
  } finally {
    if (prevFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = prevFreeze;
    }
  }

  // ---- 周/月/年周期指标与 M9（历史已实现累计）----
  const periods = computePeriods(effectiveDailyResults, evalISO);
  const { M11: _computedM11, M12: _computedM12, M13: _computedM13, ...periodsRest } =
    periods as ReturnType<typeof computePeriods>;
  void _computedM11;
  void _computedM12;
  void _computedM13;
  const periodM9 = (periodsRest as { M9?: number }).M9 ?? metrics.M9;
  // ---- 用新的日内拆分算法计算 M4/M5，并重算 M6 ----
  bySym = {};
  breakdownBuckets.all.length = 0;
  breakdownBuckets.m4.length = 0;
  breakdownBuckets.m5_1.length = 0;
  breakdownBuckets.m5_2.length = 0;
  M4_raw = 0;
  M5_1_raw = 0;
  M5_2_raw = 0;

  for (const p of baselinePositions) {
    const st = getSym(p.symbol);
    if (p.qty > 0) {
      st.longLots.push({
        qty: p.qty,
        cost: p.avgPrice,
        isToday: false,
        openPrice: p.avgPrice,
        time: `${baselineDate}T00:00:00Z`,
        lotDateStr: baselineDate,
        from: "history",
      });
    } else if (p.qty < 0) {
      st.shortLots.push({
        qty: -p.qty,
        cost: p.avgPrice,
        isToday: false,
        openPrice: p.avgPrice,
        time: `${baselineDate}T00:00:00Z`,
        lotDateStr: baselineDate,
        from: "history",
      });
    }
  }

  const sortedTrades = [...rawTrades].sort((a, b) => a.date.localeCompare(b.date));
  let fillSeq = 0;
  for (const t of sortedTrades) {
    const st = getSym(t.symbol);
    const today = isSameTradingDayNY(t.date, evalISO);
    const lotDateStr = nyDateStrSafe(t.date);
    const from: "history" | "today" = today ? "today" : "history";
    const fillId = `${++fillSeq}:${t.symbol}|${t.date}|${t.side}`;
    if (t.side === 'BUY') {
      st.longLots.push({
        qty: t.qty,
        cost: t.price,
        isToday: today,
        openPrice: t.price,
        time: t.date,
        lotDateStr,
        from,
      });
      if (today)
        st.behLong.push({
          qty: t.qty,
          cost: t.price,
          isToday: true,
          openPrice: t.price,
          time: t.date,
          lotDateStr,
          from: "today",
        });
    } else if (t.side === 'SHORT') {
      st.shortLots.push({
        qty: t.qty,
        cost: t.price,
        isToday: today,
        openPrice: t.price,
        time: t.date,
        lotDateStr,
        from,
      });
      if (today)
        st.behShort.push({
          qty: t.qty,
          cost: t.price,
          isToday: true,
          openPrice: t.price,
          time: t.date,
          lotDateStr,
          from: "today",
        });
    } else if (t.side === 'SELL') {
      const preview = fifoPreview(st.longLots, t.qty);
      const previewTodayQty = preview.reduce((s, x) => (x.from === "today" ? s + x.qty : s), 0);
      const behAvailable = behAvail(st.behLong);
      const todayClosed = Math.min(previewTodayQty, behAvailable);
      if (process.env.MONITOR === '1') {
        console.log('[runAll SELL]', { previewTodayQty, behAvail: behAvailable, todayClosed });
      }
      for (const r of preview.filter((r) => r.from === "history")) {
        postM4_Long(r, t.price, t.symbol, t.date, fillId);
      }
      fifoApply(st.longLots, preview);
      const todayLots = behConsume(st.behLong, todayClosed);
      postM5_Long(todayLots, preview, t.price, t.symbol, t.date, fillId);
    } else if (t.side === 'COVER') {
      const preview = fifoPreview(st.shortLots, t.qty);
      const previewTodayQty = preview.reduce((s, x) => (x.from === "today" ? s + x.qty : s), 0);
      const behAvailable = behAvail(st.behShort);
      const todayClosed = Math.min(previewTodayQty, behAvailable);
      if (process.env.MONITOR === '1') {
        console.log('[runAll COVER]', { previewTodayQty, behAvail: behAvailable, todayClosed });
      }
      for (const r of preview.filter((r) => r.from === "history")) {
        postM4_Short(r, t.price, t.symbol, t.date, fillId);
      }
      fifoApply(st.shortLots, preview);
      const todayLots = behConsume(st.behShort, todayClosed);
      postM5_Short(todayLots, preview, t.price, t.symbol, t.date, fillId);
    }
  }

  const M4_override = M4_raw;
  const M5_1_override = M5_1_raw;
  const M5_2_override = M5_2_raw;
  const M4_r = round2(M4_override);
  const M5_1_r = round2(M5_1_override);
  const M5_2_r = round2(M5_2_override);
  const m3Nominal =
    typeof metrics.M3Legacy === "number" && Number.isFinite(metrics.M3Legacy)
      ? metrics.M3Legacy
      : metrics.M3.nominal;
  const M3_r = round2(m3Nominal);
  const priceChangeRaw = metrics.aux?.m6PriceChange ?? 0;
  const todayRealizedTotalRaw = M4_override + M5_2_override;
  const todayRealizedTotal = round2(todayRealizedTotalRaw);
  const realizedIntradayToday = M5_2_r;
  const priceChange_r = round2(priceChangeRaw);
  const prevRealized_r = M4_r;
  const M6_raw = todayRealizedTotalRaw + priceChangeRaw;
  const M6_r = round2(M6_raw);
  const mtmOvernightRaw = metrics._m6?.mtmOvernight ?? priceChangeRaw;
  const mtmIntradayRaw = metrics._m6?.mtmIntradayOpen ?? 0;
  const m6Details = {
    realizedToday: todayRealizedTotal,
    mtmOvernight: round2(mtmOvernightRaw),
    mtmIntradayOpen: round2(mtmIntradayRaw),
    warnings: Array.isArray(metrics._m6?.warnings)
      ? [...metrics._m6.warnings]
      : [],
  };
  const baseM4Today = metrics.M4_today;
  const derivedM4Degraded =
    Boolean(baseM4Today?.degraded) ||
    (metrics.aux?.missingPrevCloseSymbols?.length ?? 0) > 0;
  const m4Today = createM4TodayDetail({
    realized: todayRealizedTotal,
    mtmOvernight: mtmOvernightRaw,
    mtmIntradayOpen: mtmIntradayRaw,
    degraded: derivedM4Degraded,
  });

  const winRatePct = round1(metrics.M10.rate * 100);

  const periodMeta = metrics._period;

  const breakdown = {
    all: breakdownBuckets.all,
    m4: breakdownBuckets.m4,
    m5_1: breakdownBuckets.m5_1,
    m5_2: breakdownBuckets.m5_2,
  };

  const result = {
    ...periodsRest,
    M1: round2(metrics.M1),
    M2: round2(metrics.M2),
    M3: M3_r,
    M4: M4_r,
    M5_1: M5_1_r,
    M5_2: M5_2_r,
    M6: M6_r,
    M4_today: m4Today,
    _m6: m6Details,
    M7: metrics.M7,
    M8: metrics.M8,
    M9: periodM9,
    M10: { W: metrics.M10.win, L: metrics.M10.loss, winRatePct },
    M11: metrics.M11,
    M12: metrics.M12,
    M13: metrics.M13,
    ...(periodMeta ? { _period: periodMeta } : {}),
    aux: {
      breakdown,
      m6PriceChange: priceChange_r,
      m6PrevRealizedTotal: prevRealized_r,
      m6FifoToday: M5_2_r,
      realized: {
        today_intraday: realizedIntradayToday,
        today_total: todayRealizedTotal,
      },
      m6Legs: metrics.aux?.m6Legs ?? [],
      m6Excluded: metrics.aux?.m6Excluded ?? [],
      missingPrevCloseSymbols: metrics.aux?.missingPrevCloseSymbols ?? [],
    },
  } as const;

  if (process.env.MONITOR === "1") {
    const monitor = await loadMonitor();
    monitor.snapshotArtifacts(
      {
        initialPositions: baselinePositions,
        rawTrades,
        closePrices,
        dailyResults: effectiveDailyResults,
      },
      result,
    );
    try {
      monitor.assertM6Equality(result);
      monitor.assertNoOverClose(enriched);
      monitor.assertLotConservation(baselinePositions, enriched);
      monitor.assertNoNegativeLots(enriched);
    } catch (err: any) {
      const pathModule = await loadPath();
      const fs = await loadFs();
      const outDir = pathModule.resolve(process.cwd(), ".artifacts/outputs");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        pathModule.join(outDir, "failure.json"),
        JSON.stringify({ error: err?.message || String(err) }, null, 2),
      );
      throw err;
    }
  }

  return result;
}

export default runAll;
