import { runAll, type RawTrade } from "../runAll";
import { nyDateStrSafe, isSameTradingDayNY } from "../time";
import { MoneyDecimal as Decimal, round2 } from "../money";

export type M4SelfcheckIssue = {
  symbol: string;
  reason:
    | "TODAY_LOTS_INCLUDED_IN_M4"
    | "MIXED_MATCH_NOT_SPLIT"
    | "TIMEZONE_TODAY_MISCLASSIFIED"
    | "ROUNDING_STAGE_INCORRECT"
    | "REALIZED_TODAY_MISMATCH";
  details: string;
};

export type M4SelfcheckReport = {
  ok: boolean;
  summary: {
    symbols: number;
    legsChecked: number;
    m4Total: number;
  };
  issues: M4SelfcheckIssue[];
};

type RunAllArgs = Parameters<typeof runAll>;

type BreakdownRow = {
  symbol?: string;
  into?: string;
  qty?: number;
  action?: string;
  closePrice?: number;
  fifoCost?: number;
  openPrice?: number;
  lotTag?: string;
  time?: string;
  lotDateStr?: string;
  from?: "history" | "today";
  isToday?: boolean;
  pnl_raw?: number;
  pnl?: number;
  fillId?: string;
};

type TradeKey = string;

const asNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

function inferTodayStr(args: RunAllArgs): string | undefined {
  if (typeof args[0] === "string" && args[0].trim()) return args[0];

  const lastArg = args[args.length - 1];
  if (lastArg && typeof lastArg === "object" && "evalDate" in lastArg) {
    const evalDate = (lastArg as { evalDate?: Date | string }).evalDate;
    if (evalDate) return nyDateStrSafe(evalDate);
  }

  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    const obj = args[0] as { from?: string; evalDate?: Date | string };
    if (obj.from) return obj.from;
    if (obj.evalDate) return nyDateStrSafe(obj.evalDate);
  }

  return undefined;
}

function extractTrades(args: RunAllArgs): RawTrade[] {
  if (args.length >= 3 && Array.isArray(args[2])) {
    return args[2] as RawTrade[];
  }
  if (args.length === 1 && args[0] && typeof args[0] === "object") {
    const obj = args[0] as { trades?: RawTrade[] };
    if (Array.isArray(obj.trades)) return obj.trades;
  }
  return [];
}

function makeTradeKey(symbol: string | undefined, time: string | undefined, action: string | undefined): TradeKey | null {
  if (!symbol || !time || !action) return null;
  return `${symbol}|${time}|${action}`;
}

function calcLegRaw(row: BreakdownRow): number {
  const qty = asNumber(row.qty);
  if (!Number.isFinite(qty) || qty === 0) return 0;
  const close = asNumber(row.closePrice);
  const cost = asNumber(row.fifoCost ?? row.openPrice);
  if (!Number.isFinite(close) || !Number.isFinite(cost)) return 0;
  const qtyDec = new Decimal(qty);
  const closeDec = new Decimal(close);
  const costDec = new Decimal(cost);
  const diff = row.action === "COVER" ? costDec.minus(closeDec) : closeDec.minus(costDec);
  return diff.mul(qtyDec).toNumber();
}

export async function selfcheckM4(...args: RunAllArgs): Promise<M4SelfcheckReport> {
  const result = await runAll(...args);
  const issues: M4SelfcheckIssue[] = [];

  const todayStr = inferTodayStr(args);
  const breakdownSource = (result as any)?.aux?.breakdown;
  const breakdown: BreakdownRow[] = Array.isArray(breakdownSource?.all)
    ? (breakdownSource.all as BreakdownRow[])
    : Array.isArray(breakdownSource)
    ? (breakdownSource as BreakdownRow[])
    : [];
  const m4Legs = Array.isArray(breakdownSource?.m4)
    ? (breakdownSource.m4 as BreakdownRow[])
    : breakdown.filter((row) => row.into === "M4");
  const uniqueSymbols = new Set<string>();

  let sumRaw = 0;
  for (const leg of m4Legs) {
    if (leg.symbol) uniqueSymbols.add(leg.symbol);
    const raw = typeof leg.pnl_raw === "number" ? leg.pnl_raw : calcLegRaw(leg);
    sumRaw += raw;
  }

  const m4FromResult = asNumber((result as any)?.M4 ?? (result as any)?.M4?.total);
  const m5Today = asNumber(
    (result as any)?.aux?.realized?.today_intraday ?? (result as any)?.M5?.fifo ?? (result as any)?.M5_2,
  );
  const reportedTodayTotal = asNumber(
    (result as any)?.aux?.realized?.today_total ?? (result as any)?._m6?.realizedToday,
  );
  const prevRealized = asNumber((result as any)?.aux?.m6PrevRealizedTotal);

  const legsChecked = m4Legs.length;

  // Rule 1: M4 should not include today's lots
  for (const leg of m4Legs) {
    let normalizedFrom: "history" | "today" | undefined =
      leg.from === "history" || leg.from === "today" ? leg.from : undefined;

    if (!normalizedFrom && typeof leg.isToday === "boolean") {
      normalizedFrom = leg.isToday ? "today" : "history";
    }

    if (!normalizedFrom && todayStr) {
      if (leg.lotDateStr) {
        normalizedFrom = isSameTradingDayNY(leg.lotDateStr, todayStr) ? "today" : "history";
      } else if (leg.time) {
        const closeDay = nyDateStrSafe(leg.time);
        normalizedFrom = isSameTradingDayNY(closeDay, todayStr) ? "today" : "history";
      }
    }

    const isTodayLot = leg.lotTag === "T" || normalizedFrom === "today";
    if (isTodayLot || (normalizedFrom && normalizedFrom !== "history")) {
      issues.push({
        symbol: leg.symbol ?? "?",
        reason: "TODAY_LOTS_INCLUDED_IN_M4",
        details: `fillId=${leg.fillId ?? "?"} classified as ${normalizedFrom ?? leg.from ?? "unknown"}; lotDate=${leg.lotDateStr ?? "?"}; today=${todayStr ?? "?"}`,
      });
    }
  }

  const trades = extractTrades(args);
  const tradeQtyByKey = new Map<TradeKey, number>();
  for (const trade of trades) {
    if (!trade || (trade.side !== "SELL" && trade.side !== "COVER")) continue;
    const tradeDay = todayStr ? nyDateStrSafe(trade.date) : undefined;
    if (todayStr && tradeDay !== todayStr) continue;
    const key = makeTradeKey(trade.symbol, trade.date, trade.side);
    if (!key) continue;
    tradeQtyByKey.set(key, (tradeQtyByKey.get(key) ?? 0) + asNumber(trade.qty));
  }

  const breakdownByKey = new Map<
    TradeKey,
    { historyQty: number; todayQty: number; legs: BreakdownRow[] }
  >();
  for (const row of breakdown) {
    const key = makeTradeKey(row.symbol, row.time, row.action);
    if (!key) continue;
    const entry =
      breakdownByKey.get(key) ?? { historyQty: 0, todayQty: 0, legs: [] };
    const qty = asNumber(row.qty);
    if (row.into === "M4") {
      entry.historyQty += qty;
    } else if (row.into === "M5.1" || row.into === "M5.2") {
      entry.todayQty += qty;
    }
    entry.legs.push(row);
    breakdownByKey.set(key, entry);
  }

  for (const [key, tradeQty] of tradeQtyByKey.entries()) {
    const entry = breakdownByKey.get(key) ?? { historyQty: 0, todayQty: 0, legs: [] };
    const historyQty = entry.historyQty;
    const todayQty = entry.todayQty;
    const mixed =
      entry.legs.filter((leg) => leg.into === "M4").length > 0 &&
      entry.legs.filter((leg) => leg.into?.startsWith("M5")).length > 0;
    if (historyQty > 0 && tradeQty - historyQty > 1e-6 && todayQty <= 1e-6 && !mixed) {
      const [symbol, time] = key.split("|");
      issues.push({
        symbol,
        reason: "MIXED_MATCH_NOT_SPLIT",
        details: `Trade at ${time} closed ${tradeQty} but M4 counted ${historyQty} with no today leg split.`,
      });
    }
  }

  if (todayStr) {
    for (const leg of m4Legs.slice(0, 3)) {
      const closeDay = leg.time ? nyDateStrSafe(leg.time) : undefined;
      if (closeDay && !isSameTradingDayNY(closeDay, todayStr)) {
        issues.push({
          symbol: leg.symbol ?? "?",
          reason: "TIMEZONE_TODAY_MISCLASSIFIED",
          details: `Close time ${leg.time} classified as today (${todayStr}) mismatch.`,
        });
      }
    }
  }

  const sumRounded = round2(sumRaw);
  if (Math.abs(sumRounded - m4FromResult) > 0.02) {
    issues.push({
      symbol: "*",
      reason: "ROUNDING_STAGE_INCORRECT",
      details: `Rounded sum=${sumRounded} but result.M4=${m4FromResult}.`,
    });
  }

  const expectToday = round2(m4FromResult + m5Today);
  const fallbackToday = round2(prevRealized + m5Today);
  if (
    Math.abs(expectToday - reportedTodayTotal) > 0.01 &&
    Math.abs(expectToday - fallbackToday) > 0.01
  ) {
    issues.push({
      symbol: "*",
      reason: "REALIZED_TODAY_MISMATCH",
      details: `reported=${reportedTodayTotal} expected=${expectToday} (fallback=${fallbackToday}, M4=${m4FromResult}, M5_FIFO=${m5Today}).`,
    });
  }

  return {
    ok: issues.length === 0,
    summary: {
      symbols: uniqueSymbols.size,
      legsChecked,
      m4Total: round2(m4FromResult),
    },
    issues,
  };
}
