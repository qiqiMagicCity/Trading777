import type { EnrichedTrade, InitialPosition } from "@/lib/fifo";
import { computeFifo } from "@/lib/fifo";
import { MoneyDecimal as M, avgPrice } from "@/lib/money";
import sortTrades from "@/lib/sortTrades";
import { toNY } from "@/lib/timezone";
import type { Position, Trade } from "@/lib/services/dataService";

const EPSILON = 1e-6;

function normalizeSymbol(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().toUpperCase();
}

export function applyBreakEvenToPositions(
  positions: Position[],
  enrichedTrades: EnrichedTrade[],
): void {
  const grouped = new Map<string, EnrichedTrade[]>();
  for (const trade of enrichedTrades) {
    const symbol = normalizeSymbol(trade.symbol);
    if (!symbol) continue;
    const bucket = grouped.get(symbol);
    if (bucket) {
      bucket.push(trade);
    } else {
      grouped.set(symbol, [trade]);
    }
  }

  for (const pos of positions) {
    const symbol = normalizeSymbol(pos.symbol);
    if (!symbol) {
      pos.breakEvenPrice = null;
      pos.breakEvenJ = null;
      pos.breakEvenJSticky = null;
      continue;
    }

    const trades = grouped.get(symbol);
    if (!trades || trades.length === 0) {
      pos.breakEvenPrice = null;
      pos.breakEvenJ = null;
      pos.breakEvenJSticky = null;
      continue;
    }

    let matched: EnrichedTrade | undefined;
    for (let idx = trades.length - 1; idx >= 0; idx -= 1) {
      const trade = trades[idx]!;
      if (Math.abs(trade.quantityAfter - pos.qty) <= EPSILON) {
        matched = trade;
        break;
      }
    }

    if (!matched) {
      for (let idx = trades.length - 1; idx >= 0; idx -= 1) {
        const trade = trades[idx]!;
        if (Math.abs(trade.netPosition - pos.qty) <= EPSILON) {
          matched = trade;
          break;
        }
      }
    }

    if (!matched) {
      matched = trades[trades.length - 1];
    }

    if (matched) {
      pos.breakEvenPrice = matched.breakEvenPrice ?? null;
      pos.breakEvenJ = matched.breakEvenJ ?? null;
      pos.breakEvenJSticky = matched.breakEvenJSticky ?? null;
    } else {
      pos.breakEvenPrice = null;
      pos.breakEvenJ = null;
      pos.breakEvenJSticky = null;
    }
  }
}

export interface TradeReplayBaseline {
  baselineTrades: Trade[];
  actualTrades: Trade[];
  initialPositions: InitialPosition[];
}

export interface TradeReplayResult {
  baseline: TradeReplayBaseline;
  positions: Position[];
}

function sortRawTrades(trades: Trade[]): Trade[] {
  return trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = Number.isFinite(timeA) ? timeA : Infinity;
      const bTime = Number.isFinite(timeB) ? timeB : Infinity;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);
}

function deriveInitialPositions(trades: Trade[]): InitialPosition[] {
  const map = new Map<string, { qty: number; cost: number }>();
  for (const trade of trades) {
    if (!trade.isInitialPosition) continue;
    const qtyAbs = Math.abs(trade.quantity);
    if (qtyAbs <= EPSILON) continue;
    const signedQty = trade.action === "short" ? -qtyAbs : qtyAbs;
    const entry = map.get(trade.symbol) ?? { qty: 0, cost: 0 };
    entry.qty += signedQty;
    entry.cost += trade.price * qtyAbs;
    map.set(trade.symbol, entry);
  }
  const result: InitialPosition[] = [];
  for (const [symbol, { qty, cost }] of map.entries()) {
    const denom = Math.abs(qty);
    result.push({
      symbol,
      qty,
      avgPrice: denom > EPSILON ? cost / denom : 0,
    });
  }
  return result;
}

function replayPositions(trades: Trade[]): Position[] {
  type SymbolState = {
    lots: { price: number; quantity: number }[];
    direction: "NONE" | "LONG" | "SHORT";
  };
  const state: Record<string, SymbolState> = {};

  for (const trade of trades) {
    const quantity = Math.abs(trade.quantity);
    if (quantity <= EPSILON) continue;
    const symbol = trade.symbol;
    const info =
      state[symbol] || (state[symbol] = { lots: [], direction: "NONE" });

    if (trade.action === "buy" || trade.action === "cover") {
      if (info.direction === "NONE" || info.direction === "LONG") {
        info.lots.push({ price: trade.price, quantity });
        info.direction = "LONG";
        continue;
      }

      let remain = quantity;
      while (remain > EPSILON && info.lots.length > 0) {
        const lot = info.lots[0]!;
        const matched = Math.min(remain, lot.quantity);
        lot.quantity -= matched;
        remain -= matched;
        if (lot.quantity <= EPSILON) {
          info.lots.shift();
        }
      }

      if (remain > EPSILON) {
        info.lots = [{ price: trade.price, quantity: remain }];
        info.direction = "LONG";
      } else if (info.lots.length === 0) {
        info.direction = "NONE";
      }
    } else {
      if (info.direction === "NONE" || info.direction === "SHORT") {
        info.lots.push({ price: trade.price, quantity });
        info.direction = "SHORT";
        continue;
      }

      let remain = quantity;
      while (remain > EPSILON && info.lots.length > 0) {
        const lot = info.lots[0]!;
        const matched = Math.min(remain, lot.quantity);
        lot.quantity -= matched;
        remain -= matched;
        if (lot.quantity <= EPSILON) {
          info.lots.shift();
        }
      }

      if (remain > EPSILON) {
        info.lots = [{ price: trade.price, quantity: remain }];
        info.direction = "SHORT";
      } else if (info.lots.length === 0) {
        info.direction = "NONE";
      }
    }
  }

  const positions: Position[] = [];
  for (const [symbol, info] of Object.entries(state)) {
    const totalQuantityDec = info.lots.reduce(
      (sum, lot) => sum.plus(lot.quantity),
      new M(0),
    );
    const totalQuantity = totalQuantityDec.toNumber();
    if (totalQuantity <= EPSILON) continue;

    const costDec = info.lots.reduce(
      (sum, lot) => sum.plus(new M(lot.price).mul(lot.quantity)),
      new M(0),
    );
    const cost = costDec.toNumber();
    const average = avgPrice(cost, totalQuantity, 4);
    const signedQty = info.direction === "SHORT" ? -totalQuantity : totalQuantity;

    positions.push({
      symbol,
      qty: signedQty,
      avgPrice: average,
      last: average,
      priceOk: true,
      stale: false,
    });
  }

  return positions;
}

export function replayPortfolio(trades: Trade[]): TradeReplayResult {
  const sortedTrades = sortRawTrades(trades);
  const baselineTrades = sortedTrades.filter((t) => t.isInitialPosition);
  const actualTrades = sortedTrades.filter((t) => !t.isInitialPosition);
  const initialPositions = deriveInitialPositions(baselineTrades);
  const positions = replayPositions(sortedTrades);
  const baseline: TradeReplayBaseline = {
    baselineTrades,
    actualTrades,
    initialPositions,
  };
  const enrichedForPositions = buildEnrichedTrades(baseline);
  applyBreakEvenToPositions(positions, enrichedForPositions);

  return {
    baseline,
    positions,
  };
}

export function buildEnrichedTrades(
  baseline: TradeReplayBaseline,
): EnrichedTrade[] {
  const baselineEnriched = computeFifo(baseline.baselineTrades, []);
  const actualEnriched = computeFifo(
    baseline.actualTrades,
    baseline.initialPositions,
  );

  const offsetBySymbol = new Map<string, number>();
  for (const trade of baselineEnriched) {
    offsetBySymbol.set(trade.symbol, trade.tradeCount);
  }

  const adjustedActual = actualEnriched.map((trade) => ({
    ...trade,
    tradeCount: trade.tradeCount + (offsetBySymbol.get(trade.symbol) ?? 0),
  }));

  return sortTrades([...baselineEnriched, ...adjustedActual]);
}

export function extractInitialPositionsFromTrades(
  trades: Trade[],
): InitialPosition[] {
  return deriveInitialPositions(trades);
}
