import Decimal from "decimal.js-light";
import { isSameTradingDayNY, nyDateStrSafe, toNY } from "./time";
import { round2 } from "./money";

export type HistoricalLotInput = {
  symbol: string;
  /** 正数=多头，负数=空头；方向也可通过 direction 指定。 */
  qty: number;
  /** 每股/每份的历史成本价 */
  cost: number;
  /** lot 对应的方向，未提供时通过 qty 推断 */
  direction?: "long" | "short";
  /** lot 对应的纽约日字符串（用于 FIFO 排序，可选） */
  lotDate?: string;
  /** 合约乘数，缺省读取 multiplierBySymbol 或 1 */
  multiplier?: number;
};

export type TradeFeeBreakdown = {
  commission?: number;
  orf?: number;
  taf?: number;
  sec?: number;
  [key: string]: number | undefined;
};

export type TradeInput = {
  symbol: string;
  side: "BUY" | "SELL" | "SHORT" | "COVER";
  qty: number;
  price: number;
  date: string | Date;
  multiplier?: number;
  fees?: TradeFeeBreakdown;
};

export type M4Leg = {
  symbol: string;
  direction: "long" | "short";
  matchedQty: number;
  sellOrCoverPrice: number;
  historicalCost: number;
  multiplier: number;
  fees: Required<Pick<TradeFeeBreakdown, "commission" | "orf" | "taf" | "sec">>;
  pnl: number;
  lotDate?: string;
  tradeDate?: string;
};

export type M4HistoricalSummary = {
  realizedFromHistorical: number;
  legs: M4Leg[];
};

export type CalcM4HistoricalParams = {
  evalDate: string | Date;
  historicalLots: HistoricalLotInput[];
  trades: TradeInput[];
  multiplierBySymbol?: Record<string, number>;
};

type InternalLot = {
  qty: number;
  cost: number;
  from: "history" | "today";
  lotDate?: string;
  multiplier?: number;
};

type SymbolState = {
  longLots: InternalLot[];
  shortLots: InternalLot[];
};

const EPSILON = 1e-9;

function normalizeMultiplier(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function normalizeQty(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) > EPSILON ? Math.abs(n) : undefined;
}

function normalizePrice(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSide(side: unknown): TradeInput["side"] | null {
  if (typeof side !== "string") return null;
  const upper = side.trim().toUpperCase();
  if (upper === "BUY" || upper === "SELL" || upper === "SHORT" || upper === "COVER") {
    return upper as TradeInput["side"];
  }
  return null;
}

function resolveMultiplier(
  symbol: string,
  lot: InternalLot | null,
  tradeMultiplier: number | undefined,
  table?: Record<string, number>,
): number {
  const candidates = [lot?.multiplier, tradeMultiplier, table?.[symbol]];
  for (const c of candidates) {
    const normalized = normalizeMultiplier(c);
    if (normalized !== undefined) return normalized;
  }
  return 1;
}

function normalizeFees(fees: TradeFeeBreakdown | undefined): Required<M4Leg["fees"]> {
  const toNumber = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    commission: toNumber(fees?.commission),
    orf: toNumber(fees?.orf),
    taf: toNumber(fees?.taf),
    sec: toNumber(fees?.sec),
  };
}

function cloneFees(fees: M4Leg["fees"]): M4Leg["fees"] {
  return {
    commission: fees.commission,
    orf: fees.orf,
    taf: fees.taf,
    sec: fees.sec,
  };
}

function scaleFees(fees: M4Leg["fees"], ratio: number): M4Leg["fees"] {
  const r = new Decimal(ratio);
  return {
    commission: r.mul(fees.commission).toNumber(),
    orf: r.mul(fees.orf).toNumber(),
    taf: r.mul(fees.taf).toNumber(),
    sec: r.mul(fees.sec).toNumber(),
  };
}

function getOrCreateSymbolState(map: Map<string, SymbolState>, symbol: string): SymbolState {
  let state = map.get(symbol);
  if (!state) {
    state = { longLots: [], shortLots: [] };
    map.set(symbol, state);
  }
  return state;
}

function pushHistoricalLots(
  stateMap: Map<string, SymbolState>,
  lots: HistoricalLotInput[],
  multiplierBySymbol?: Record<string, number>,
) {
  const sorted = lots
    .map((lot, idx) => ({ lot, idx }))
    .sort((a, b) => {
      const da = a.lot.lotDate ? toNY(a.lot.lotDate).getTime() : Number.POSITIVE_INFINITY;
      const db = b.lot.lotDate ? toNY(b.lot.lotDate).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
      return a.idx - b.idx;
    });

  for (const { lot } of sorted) {
    const qty = normalizeQty(lot.qty);
    const cost = normalizePrice(lot.cost);
    if (qty === undefined || cost === undefined) continue;
    const direction = lot.direction
      ? lot.direction
      : lot.qty < 0
      ? "short"
      : "long";
    const symbol = lot.symbol?.trim?.().toUpperCase?.() ?? lot.symbol;
    if (!symbol) continue;
    const multiplier = normalizeMultiplier(lot.multiplier) ?? normalizeMultiplier(multiplierBySymbol?.[symbol]);
    const state = getOrCreateSymbolState(stateMap, symbol);
    const bucket = direction === "long" ? state.longLots : state.shortLots;
    bucket.push({
      qty,
      cost,
      from: "history",
      lotDate: lot.lotDate ? nyDateStrSafe(lot.lotDate) : undefined,
      multiplier: multiplier,
    });
  }
}

function consumeLots(
  lots: InternalLot[],
  qty: number,
): { consumed: Array<{ lot: InternalLot; qty: number }> } {
  const consumed: Array<{ lot: InternalLot; qty: number }> = [];
  let remain = qty;
  let idx = 0;
  while (remain > EPSILON && idx < lots.length) {
    const lot = lots[idx]!;
    if (lot.qty <= EPSILON) {
      lots.splice(idx, 1);
      continue;
    }
    const take = Math.min(remain, lot.qty);
    if (take > EPSILON) {
      consumed.push({ lot, qty: take });
      lot.qty -= take;
      remain -= take;
    }
    if (lot.qty <= EPSILON) {
      lots.splice(idx, 1);
    } else {
      idx += 1;
    }
  }
  return { consumed };
}

export function calcM4Historical(params: CalcM4HistoricalParams): { m4: M4HistoricalSummary } {
  const { evalDate, historicalLots, trades, multiplierBySymbol } = params;
  const evalDateStr = nyDateStrSafe(evalDate);
  const stateMap = new Map<string, SymbolState>();
  pushHistoricalLots(stateMap, historicalLots, multiplierBySymbol);

  const normalizedTrades = trades
    .map((t, idx) => ({ raw: t, idx }))
    .map(({ raw, idx }) => {
      const symbol = raw.symbol?.trim?.().toUpperCase?.() ?? raw.symbol;
      const side = normalizeSide(raw.side);
      const qty = normalizeQty(raw.qty);
      const price = normalizePrice(raw.price);
      if (!symbol || !side || qty === undefined || price === undefined) {
        return null;
      }
      const date = typeof raw.date === "string" || raw.date instanceof Date ? raw.date : new Date(raw.date);
      return {
        symbol,
        side,
        qty,
        price,
        date,
        multiplier: normalizeMultiplier(raw.multiplier),
        fees: normalizeFees(raw.fees),
        idx,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => {
      const ta = toNY(a.date).getTime();
      const tb = toNY(b.date).getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return a.idx - b.idx;
    });

  const legs: M4Leg[] = [];
  let realizedRaw = new Decimal(0);

  for (const trade of normalizedTrades) {
    if (!isSameTradingDayNY(trade.date, evalDateStr)) {
      continue;
    }
    const state = getOrCreateSymbolState(stateMap, trade.symbol);

    if (trade.side === "BUY") {
      state.longLots.push({
        qty: trade.qty,
        cost: trade.price,
        from: "today",
        lotDate: nyDateStrSafe(trade.date),
        multiplier: trade.multiplier,
      });
      continue;
    }

    if (trade.side === "SHORT") {
      state.shortLots.push({
        qty: trade.qty,
        cost: trade.price,
        from: "today",
        lotDate: nyDateStrSafe(trade.date),
        multiplier: trade.multiplier,
      });
      continue;
    }

    const queue = trade.side === "SELL" ? state.longLots : state.shortLots;
    if (queue.length === 0) {
      continue;
    }

    const { consumed } = consumeLots(queue, trade.qty);
    if (consumed.length === 0) {
      continue;
    }

    const historyMatches = consumed.filter((item) => item.lot.from === "history");
    if (historyMatches.length === 0) {
      continue;
    }

    const totalHistoryQty = historyMatches.reduce((sum, item) => sum + item.qty, 0);
    const tradeFees = cloneFees(trade.fees);
    const feeRatioBase = trade.qty > 0 ? totalHistoryQty / trade.qty : 0;
    const historyFeePool = scaleFees(tradeFees, feeRatioBase || 0);

    let allocatedCommission = 0;
    let allocatedOrf = 0;
    let allocatedTaf = 0;
    let allocatedSec = 0;

    const historyFeeTotals = historyMatches.map((match, idx) => {
      const ratio = totalHistoryQty > 0 ? match.qty / totalHistoryQty : 0;
      const feesForLeg = scaleFees(historyFeePool, ratio);
      if (idx === historyMatches.length - 1) {
        feesForLeg.commission = historyFeePool.commission - allocatedCommission;
        feesForLeg.orf = historyFeePool.orf - allocatedOrf;
        feesForLeg.taf = historyFeePool.taf - allocatedTaf;
        feesForLeg.sec = historyFeePool.sec - allocatedSec;
      } else {
        allocatedCommission += feesForLeg.commission;
        allocatedOrf += feesForLeg.orf;
        allocatedTaf += feesForLeg.taf;
        allocatedSec += feesForLeg.sec;
      }
      return feesForLeg;
    });

    historyMatches.forEach((match, index) => {
      const lot = match.lot;
      const qtyUsed = match.qty;
      const multiplier = resolveMultiplier(trade.symbol, lot, trade.multiplier, multiplierBySymbol);
      const qtyDecimal = new Decimal(qtyUsed);
      let pnlRaw: Decimal;
      if (trade.side === "SELL") {
        pnlRaw = new Decimal(trade.price).minus(lot.cost).mul(qtyDecimal).mul(multiplier);
      } else {
        pnlRaw = new Decimal(lot.cost).minus(trade.price).mul(qtyDecimal).mul(multiplier);
      }

      realizedRaw = realizedRaw.plus(pnlRaw);

      legs.push({
        symbol: trade.symbol,
        direction: trade.side === "SELL" ? "long" : "short",
        matchedQty: qtyUsed,
        sellOrCoverPrice: trade.price,
        historicalCost: lot.cost,
        multiplier,
        fees: historyFeeTotals[index] ?? scaleFees(historyFeePool, qtyUsed / totalHistoryQty),
        pnl: round2(pnlRaw.toNumber()),
        lotDate: lot.lotDate,
        tradeDate:
          typeof trade.date === "string"
            ? trade.date
            : (trade.date instanceof Date ? trade.date.toISOString() : undefined),
      });
    });
  }

  const realizedFromHistorical = round2(realizedRaw.toNumber());

  return { m4: { realizedFromHistorical, legs } };
}

export default calcM4Historical;
