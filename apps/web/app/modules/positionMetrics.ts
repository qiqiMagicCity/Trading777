import type { MetricsContract } from "@/app/lib/types/metrics";
import { add4, div4, mul4, round4, sub4 } from "@/app/lib/precision";
import { nyDateStrSafe } from "@/app/lib/time";
import type { Position } from "@/lib/services/dataService";
import type { EnrichedTrade } from "@/lib/fifo";

export function normalizeSymbol(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().toUpperCase();
}

export function getResolvedPrice(pos: Position, quotePrice: unknown): number {
  const fallbackPrice = Number.isFinite(pos.last) ? pos.last : pos.avgPrice;
  const candidatePrice =
    typeof quotePrice === "number" && Number.isFinite(quotePrice)
      ? quotePrice
      : fallbackPrice;

  return Number.isFinite(candidatePrice) ? (candidatePrice as number) : pos.avgPrice;
}

export type IntradayPnlDataset = {
  values: Map<string, number>;
  hasLegsData: boolean;
};

export type IntradayBreakdown = {
  overnight: number;
  intradayOpen: number;
  realizedToday: number;
  floating: number;
  sumWithRealized: number;
};

export type IntradayBreakdownDataset = {
  values: Map<string, IntradayBreakdown>;
  hasLegsData: boolean;
};

type IntradayLegComponent =
  | "realized_today"
  | "mtm_overnight"
  | "mtm_intraday_open";

type IntradayLegAccumulator = {
  baseOvernight: number;
  baseIntraday: number;
  baseRealized: number;
  overnightQty: number;
  intradayQty: number;
  intradayBasisNotional: number;
  mark?: number;
  prevClose?: number;
  multiplier?: number;
};

const ZERO_ACCUMULATOR: IntradayLegAccumulator = {
  baseOvernight: 0,
  baseIntraday: 0,
  baseRealized: 0,
  overnightQty: 0,
  intradayQty: 0,
  intradayBasisNotional: 0,
  mark: undefined,
  prevClose: undefined,
  multiplier: undefined,
};

function createAccumulator(): IntradayLegAccumulator {
  return { ...ZERO_ACCUMULATOR };
}

function collectIntradayLegs(
  metrics: MetricsContract | null | undefined,
): { values: Map<string, IntradayLegAccumulator>; hasLegsData: boolean } {
  const legs = metrics?.aux?.m6Legs;
  const map = new Map<string, IntradayLegAccumulator>();

  if (!Array.isArray(legs)) {
    return { values: map, hasLegsData: false };
  }

  for (const leg of legs) {
    if (!leg || typeof leg.symbol !== "string") continue;

    const component = leg.component as IntradayLegComponent | undefined;
    if (
      component !== "realized_today" &&
      component !== "mtm_overnight" &&
      component !== "mtm_intraday_open"
    ) {
      continue;
    }

    const key = normalizeSymbol(leg.symbol);
    if (!key) continue;

    const accumulator = map.get(key) ?? createAccumulator();

    const amount = Number(leg.amount);
    const qty = Number(leg.qty);
    const basis = Number((leg as any).basis ?? leg.basis);
    const mark = Number((leg as any).mark ?? leg.mark);
    const multiplierCandidate = Number((leg as any).multiplier);

    if (Number.isFinite(mark)) {
      accumulator.mark = round4(mark);
    }

    if (Number.isFinite(multiplierCandidate) && multiplierCandidate > 0) {
      accumulator.multiplier = multiplierCandidate;
    }

    if (component === "mtm_overnight") {
      if (Number.isFinite(amount)) {
        accumulator.baseOvernight += amount as number;
      }
      if (Number.isFinite(qty)) {
        accumulator.overnightQty += Math.abs(qty as number);
      }
      if (Number.isFinite(basis)) {
        accumulator.prevClose = round4(basis as number);
      }
    } else if (component === "mtm_intraday_open") {
      if (Number.isFinite(amount)) {
        accumulator.baseIntraday += amount as number;
      }
      if (Number.isFinite(qty)) {
        const qtyValue = Math.abs(qty as number);
        accumulator.intradayQty += qtyValue;
        if (Number.isFinite(basis)) {
          const roundedBasis = round4(basis as number);
          accumulator.intradayBasisNotional += roundedBasis * qtyValue;
        }
      }
    } else if (component === "realized_today") {
      if (Number.isFinite(amount)) {
        accumulator.baseRealized += amount as number;
      }
    }

    map.set(key, accumulator);
  }

  return { values: map, hasLegsData: true };
}

export function buildIntradayPnlMap(
  metrics: MetricsContract | null | undefined,
): IntradayPnlDataset {
  const map = new Map<string, number>();
  const legs = metrics?.aux?.m6Legs;

  if (!Array.isArray(legs)) {
    return { values: map, hasLegsData: false };
  }

  for (const leg of legs) {
    if (!leg || typeof leg.symbol !== "string") continue;
    if (
      leg.component !== "realized_today" &&
      leg.component !== "mtm_overnight" &&
      leg.component !== "mtm_intraday_open"
    ) {
      continue;
    }

    const amount = Number(leg.amount);
    if (!Number.isFinite(amount)) continue;

    const key = normalizeSymbol(leg.symbol);
    if (!key) continue;

    map.set(key, (map.get(key) ?? 0) + amount);
  }

  return { values: map, hasLegsData: true };
}

export function buildIntradayBreakdownMap(
  metrics: MetricsContract | null | undefined,
): IntradayBreakdownDataset {
  const { values: accMap, hasLegsData } = collectIntradayLegs(metrics);
  const map = new Map<string, IntradayBreakdown>();

  for (const [key, accumulator] of accMap) {
    const overnight = round4(accumulator.baseOvernight);
    const intradayOpen = round4(accumulator.baseIntraday);
    const realizedToday = round4(accumulator.baseRealized);
    const floating = round4(overnight + intradayOpen);
    const sumWithRealized = round4(floating + realizedToday);

    map.set(key, {
      overnight,
      intradayOpen,
      realizedToday,
      floating,
      sumWithRealized,
    });
  }

  return { values: map, hasLegsData };
}

export function buildIntradayFloatingPnlMap(
  metrics: MetricsContract | null | undefined,
  positions: Position[] = [],
): IntradayPnlDataset {
  const breakdown = buildIntradayFloatingBreakdown(metrics, positions);
  const map = new Map<string, number>();

  for (const [key, value] of breakdown.values) {
    map.set(key, value.floating);
  }

  return { values: map, hasLegsData: breakdown.hasLegsData };
}

export type IntradayFloatingBreakdownEntry = {
  overnight: number;
  intradayOpen: number;
  floatingPerUnit: number;
  floating: number;
  realizedToday?: number;
  qOvernight: number;
  qNow: number;
  avgTodayLong?: number;
  avgTodayShort?: number;
  mark?: number;
  prevClose?: number;
  multiplier: number;
  missingPrevClose?: boolean;
};

export type IntradayFloatingBreakdownDataset = {
  values: Map<string, IntradayFloatingBreakdownEntry>;
  hasLegsData: boolean;
};

export function buildIntradayFloatingBreakdown(
  metrics: MetricsContract | null | undefined,
  positions: Position[] = [],
): IntradayFloatingBreakdownDataset {
  const { values: accMap, hasLegsData } = collectIntradayLegs(metrics);
  const map = new Map<string, IntradayFloatingBreakdownEntry>();
  const positionIndex = new Map<string, Position>();

  for (const pos of positions) {
    const key = normalizeSymbol(pos?.symbol);
    if (key) {
      positionIndex.set(key, pos);
    }
  }

  for (const [key, accumulator] of accMap) {
    const position = positionIndex.get(key);
    const qNowRaw = Number(position?.qty);
    const qNow = Number.isFinite(qNowRaw) ? (qNowRaw as number) : 0;
    const intradayQty = accumulator.intradayQty;
    const overnightQty = accumulator.overnightQty;

    let direction = 0;
    if (Math.abs(qNow) > 1e-9) {
      direction = qNow > 0 ? 1 : -1;
    } else if (intradayQty > 0) {
      direction = accumulator.baseIntraday >= 0 ? 1 : -1;
    } else if (overnightQty > 0) {
      direction = accumulator.baseOvernight >= 0 ? 1 : -1;
    }

    let qOvernight = 0;
    if (direction !== 0) {
      if (Math.abs(qNow) > 1e-9) {
        const candidate = qNow - direction * intradayQty;
        qOvernight = Math.abs(candidate) > 1e-9 ? candidate : 0;
      } else if (overnightQty > 0) {
        qOvernight = direction * overnightQty;
      }
    }

    const multiplier = Number.isFinite(accumulator.multiplier)
      ? (accumulator.multiplier as number)
      : 1;

    let baseOvernight = accumulator.baseOvernight;
    let baseIntraday = accumulator.baseIntraday;
    const baseRealized = accumulator.baseRealized;

    if (position && Math.abs(qNow) <= 1e-9) {
      qOvernight = 0;
      baseOvernight = 0;
      baseIntraday = 0;
    }

    const floatingPerUnitRaw = baseOvernight + baseIntraday;
    const floatingPerUnit = round4(floatingPerUnitRaw);
    const floating = round4(floatingPerUnitRaw * multiplier);

    const overnight = round4(baseOvernight);
    const intradayOpen = round4(baseIntraday);
    const realizedToday = baseRealized
      ? round4(baseRealized * multiplier)
      : undefined;

    let avgTodayLong: number | undefined;
    let avgTodayShort: number | undefined;
    if (
      intradayQty > 0 &&
      Math.abs(qNow) > 1e-9 &&
      accumulator.intradayBasisNotional !== 0
    ) {
      const avgBasis = accumulator.intradayBasisNotional / intradayQty;
      const avgRounded = round4(avgBasis);
      if (direction >= 0) {
        avgTodayLong = avgRounded;
      } else {
        avgTodayShort = avgRounded;
      }
    }

    const markCandidate = Number.isFinite(accumulator.mark)
      ? (accumulator.mark as number)
      : undefined;
    const positionMark = Number(position?.last);
    const fallbackMark = Number(position?.avgPrice);
    const mark = Number.isFinite(markCandidate)
      ? markCandidate
      : Number.isFinite(positionMark)
        ? round4(positionMark as number)
        : Number.isFinite(fallbackMark)
          ? round4(fallbackMark as number)
          : undefined;

    const prevCloseCandidate = Number.isFinite(accumulator.prevClose)
      ? (accumulator.prevClose as number)
      : undefined;
    const positionPrev = Number(position?.prevClose);
    const prevClose = Number.isFinite(prevCloseCandidate)
      ? prevCloseCandidate
      : Number.isFinite(positionPrev)
        ? round4(positionPrev as number)
        : undefined;

    const missingPrevClose =
      !Number.isFinite(prevCloseCandidate) && !Number.isFinite(positionPrev);

    map.set(key, {
      overnight,
      intradayOpen,
      floatingPerUnit,
      floating,
      realizedToday,
      qOvernight,
      qNow,
      avgTodayLong,
      avgTodayShort,
      mark,
      prevClose,
      multiplier,
      missingPrevClose: missingPrevClose || undefined,
    });
  }

  return { values: map, hasLegsData };
}

const FLOAT_EPSILON = 1e-6;

type TradeAction = "buy" | "sell" | "short" | "cover";

type TradeForBuckets = {
  symbol: string;
  action: TradeAction;
  quantity: number;
  price: number;
  isInitialPosition?: boolean;
};

type TodayLotEntry = {
  longQty: number;
  longAvg?: number;
  shortQty: number;
  shortAvg?: number;
};

type BaselineSeed = Record<string, { long: number; short: number }>;

function buildTodayLotsFromTrades(
  trades: TradeForBuckets[],
  baselineSeed: BaselineSeed,
): Map<string, TodayLotEntry> {
  const bags = new Map<
    string,
    {
      long: { qty: number; price: number }[];
      short: { qty: number; price: number }[];
    }
  >();

  const baseline = new Map<string, { long: number; short: number }>();

  for (const [sym, seed] of Object.entries(baselineSeed)) {
    const long = Math.max(0, Number(seed?.long ?? 0));
    const short = Math.max(0, Number(seed?.short ?? 0));
    if (long > FLOAT_EPSILON || short > FLOAT_EPSILON) {
      baseline.set(sym, { long, short });
    }
  }

  const getBag = (sym: string) => {
    const existing = bags.get(sym);
    if (existing) return existing;
    const created = {
      long: [] as { qty: number; price: number }[],
      short: [] as { qty: number; price: number }[],
    };
    bags.set(sym, created);
    return created;
  };

  const getBaseline = (sym: string) => {
    const existing = baseline.get(sym);
    if (existing) return existing;
    const created = { long: 0, short: 0 };
    baseline.set(sym, created);
    return created;
  };

  const consumeLots = (
    lots: { qty: number; price: number }[],
    amount: number,
  ) => {
    let remain = amount;
    while (remain > FLOAT_EPSILON && lots.length > 0) {
      const lot = lots[0]!;
      const use = Math.min(lot.qty, remain);
      lot.qty -= use;
      remain -= use;
      if (lot.qty <= FLOAT_EPSILON) {
        lots.shift();
      }
    }
    return remain;
  };

  for (const trade of trades) {
    const { symbol, action } = trade;
    if (!symbol) continue;

    const qty = Math.abs(Number(trade.quantity));
    if (!Number.isFinite(qty) || qty <= FLOAT_EPSILON) continue;

    const priceRaw = Number(trade.price);
    const price = Number.isFinite(priceRaw) ? round4(priceRaw) : NaN;

    if (trade.isInitialPosition) {
      const base = getBaseline(symbol);
      if (action === "short" || trade.quantity < 0) {
        base.short += qty;
      } else {
        base.long += qty;
      }
      continue;
    }

    const bag = getBag(symbol);
    const base = baseline.get(symbol);

    if (action === "buy") {
      if (Number.isFinite(price)) {
        bag.long.push({ qty, price });
      }
      continue;
    }

    if (action === "short") {
      if (Number.isFinite(price)) {
        bag.short.push({ qty, price });
      }
      continue;
    }

    if (action === "sell") {
      let remain = consumeLots(bag.long, qty);

      if (remain > FLOAT_EPSILON && base && base.long > FLOAT_EPSILON) {
        const use = Math.min(base.long, remain);
        base.long -= use;
        remain -= use;
        if (base.long <= FLOAT_EPSILON) base.long = 0;
      }

      if (remain > FLOAT_EPSILON && Number.isFinite(price)) {
        bag.short.push({ qty: remain, price });
      }
      continue;
    }

    if (action === "cover") {
      let remain = consumeLots(bag.short, qty);

      if (remain > FLOAT_EPSILON && base && base.short > FLOAT_EPSILON) {
        const use = Math.min(base.short, remain);
        base.short -= use;
        remain -= use;
        if (base.short <= FLOAT_EPSILON) base.short = 0;
      }

      if (remain > FLOAT_EPSILON && Number.isFinite(price)) {
        bag.long.push({ qty: remain, price });
      }
    }
  }

  const result = new Map<string, TodayLotEntry>();
  for (const [sym, bag] of bags.entries()) {
    const validLongLots = bag.long.filter(
      (lot) => lot.qty > FLOAT_EPSILON && Number.isFinite(lot.price),
    );
    const validShortLots = bag.short.filter(
      (lot) => lot.qty > FLOAT_EPSILON && Number.isFinite(lot.price),
    );

    const longQty = validLongLots.reduce((acc, lot) => acc + lot.qty, 0);
    const shortQty = validShortLots.reduce((acc, lot) => acc + lot.qty, 0);

    if (longQty <= FLOAT_EPSILON && shortQty <= FLOAT_EPSILON) {
      continue;
    }

    let longCostTotal = 0;
    if (longQty > FLOAT_EPSILON) {
      for (const lot of validLongLots) {
        const lotCost = mul4(lot.price, lot.qty);
        if (Number.isFinite(lotCost)) {
          longCostTotal = add4(longCostTotal, lotCost);
        }
      }
    }

    let shortCostTotal = 0;
    if (shortQty > FLOAT_EPSILON) {
      for (const lot of validShortLots) {
        const lotCost = mul4(lot.price, lot.qty);
        if (Number.isFinite(lotCost)) {
          shortCostTotal = add4(shortCostTotal, lotCost);
        }
      }
    }

    const entry: TodayLotEntry = {
      longQty,
      shortQty,
    };

    if (longQty > FLOAT_EPSILON) {
      const avg = div4(longCostTotal, longQty);
      if (Number.isFinite(avg)) {
        entry.longAvg = round4(avg);
      }
    }

    if (shortQty > FLOAT_EPSILON) {
      const avg = div4(shortCostTotal, shortQty);
      if (Number.isFinite(avg)) {
        entry.shortAvg = round4(avg);
      }
    }

    result.set(sym, entry);
  }

  return result;
}

export type TradeBasedIntradayContext = {
  lots: Map<string, TodayLotEntry>;
  symbolsWithTrades: Set<string>;
  hasTradesData: boolean;
};

export function buildTradeBasedIntradayFloatingContext(params: {
  trades: EnrichedTrade[];
  positions: Position[];
  todayStr: string;
}): TradeBasedIntradayContext {
  const { trades, positions, todayStr } = params;
  const todayTrades: TradeForBuckets[] = [];
  const symbolsWithTrades = new Set<string>();
  const netDelta = new Map<string, number>();

  for (const trade of trades ?? []) {
    const key = normalizeSymbol(trade?.symbol);
    if (!key) continue;
    const action = trade?.action as TradeAction | undefined;
    if (
      action !== "buy" &&
      action !== "sell" &&
      action !== "short" &&
      action !== "cover"
    ) {
      continue;
    }

    const quantity = Math.abs(Number(trade.quantity));
    if (!Number.isFinite(quantity) || quantity <= FLOAT_EPSILON) continue;

    let tradeDay: string;
    try {
      tradeDay = nyDateStrSafe(trade.date);
    } catch {
      continue;
    }

    if (tradeDay !== todayStr) continue;

    const price = Number(trade.price);
    todayTrades.push({
      symbol: key,
      action,
      quantity,
      price,
      isInitialPosition: trade.isInitialPosition,
    });

    symbolsWithTrades.add(key);

    let delta = 0;
    if (action === "buy" || action === "cover") delta = quantity;
    else delta = -quantity;
    netDelta.set(key, (netDelta.get(key) ?? 0) + delta);
  }

  const positionIndex = new Map<string, Position>();
  for (const pos of positions ?? []) {
    const key = normalizeSymbol(pos?.symbol);
    if (!key) continue;
    positionIndex.set(key, pos);
  }

  const baselineSeed: BaselineSeed = {};
  const allSymbols = new Set<string>([
    ...symbolsWithTrades,
    ...positionIndex.keys(),
  ]);

  for (const key of allSymbols) {
    const pos = positionIndex.get(key);
    const qtyRaw = Number(pos?.qty ?? 0);
    const qty = Number.isFinite(qtyRaw) ? (qtyRaw as number) : 0;
    const delta = netDelta.get(key) ?? 0;
    const startQty = qty - delta;
    if (startQty > FLOAT_EPSILON) {
      baselineSeed[key] = { long: startQty, short: 0 };
    } else if (startQty < -FLOAT_EPSILON) {
      baselineSeed[key] = { long: 0, short: Math.abs(startQty) };
    }
  }

  const lots = buildTodayLotsFromTrades(todayTrades, baselineSeed);

  return {
    lots,
    symbolsWithTrades,
    hasTradesData: todayTrades.length > 0,
  };
}

type TradeBasedEntryParams = {
  symbol: string | undefined;
  qty: number;
  mark: number | undefined;
  prevClose?: number;
  multiplier?: number;
};

function getMarkOverride(
  overrides: Map<string, number> | Record<string, number> | undefined,
  key: string,
): number | undefined {
  if (!overrides) return undefined;
  if (overrides instanceof Map) {
    return overrides.get(key);
  }
  return (overrides as Record<string, number>)[key];
}

export function calculateTradeBasedIntradayFloatingEntry(
  context: TradeBasedIntradayContext | null | undefined,
  params: TradeBasedEntryParams,
): IntradayFloatingBreakdownEntry | undefined {
  if (!context) return undefined;
  const key = normalizeSymbol(params.symbol);
  if (!key) return undefined;

  const lot = context.lots.get(key);
  const longQty = lot?.longQty ?? 0;
  const shortQty = lot?.shortQty ?? 0;
  const avgLong = lot?.longAvg;
  const avgShort = lot?.shortAvg;

  const qtyRaw = Number(params.qty);
  const qNow = Number.isFinite(qtyRaw) ? (qtyRaw as number) : 0;

  const todayNewSigned = longQty - shortQty;
  let qOvernight = qNow - todayNewSigned;
  if (Math.abs(qOvernight) <= FLOAT_EPSILON) {
    qOvernight = 0;
  }

  const directionNow = Math.abs(qNow) > FLOAT_EPSILON ? (qNow > 0 ? 1 : -1) : 0;
  if (
    directionNow !== 0 &&
    qOvernight !== 0 &&
    Math.sign(qOvernight) !== directionNow
  ) {
    qOvernight = 0;
  }

  let todayQty = 0;
  if (directionNow > 0) todayQty = longQty;
  else if (directionNow < 0) todayQty = shortQty;

  const markRaw = Number(params.mark);
  const mark = Number.isFinite(markRaw) ? round4(markRaw) : undefined;
  const prevCloseRaw = Number(params.prevClose);
  const prevClose = Number.isFinite(prevCloseRaw) ? round4(prevCloseRaw) : undefined;
  const multiplierCandidate = Number(params.multiplier);
  const multiplier = Number.isFinite(multiplierCandidate) && multiplierCandidate! > 0
    ? (multiplierCandidate as number)
    : 1;

  const absOvernight = Math.abs(qOvernight);
  let overnight = 0;
  let missingPrevClose = false;

  if (absOvernight > FLOAT_EPSILON && Number.isFinite(mark)) {
    if (Number.isFinite(prevClose)) {
      if (qOvernight >= 0) {
        const diff = sub4(mark as number, prevClose as number);
        const pnl = mul4(diff, absOvernight);
        if (Number.isFinite(pnl)) overnight = pnl;
      } else {
        const diff = sub4(prevClose as number, mark as number);
        const pnl = mul4(diff, absOvernight);
        if (Number.isFinite(pnl)) overnight = pnl;
      }
    } else {
      missingPrevClose = true;
    }
  }

  let intradayOpen = 0;
  if (todayQty > FLOAT_EPSILON && Number.isFinite(mark)) {
    if (directionNow >= 0 && Number.isFinite(avgLong)) {
      const diff = sub4(mark as number, avgLong as number);
      const pnl = mul4(diff, todayQty);
      if (Number.isFinite(pnl)) intradayOpen = pnl;
    } else if (directionNow < 0 && Number.isFinite(avgShort)) {
      const diff = sub4(avgShort as number, mark as number);
      const pnl = mul4(diff, todayQty);
      if (Number.isFinite(pnl)) intradayOpen = pnl;
    }
  }

  const floatingPerUnitRaw = add4(overnight, intradayOpen);
  const floatingPerUnit = round4(floatingPerUnitRaw);
  const floating = mul4(floatingPerUnitRaw, multiplier);

  return {
    overnight: round4(overnight),
    intradayOpen: round4(intradayOpen),
    floatingPerUnit,
    floating,
    qOvernight,
    qNow,
    avgTodayLong: Number.isFinite(avgLong) ? (avgLong as number) : undefined,
    avgTodayShort: Number.isFinite(avgShort) ? (avgShort as number) : undefined,
    mark,
    prevClose,
    multiplier,
    missingPrevClose: missingPrevClose || undefined,
  };
}

export type TradeBasedIntradayFloatingBreakdownDataset = {
  values: Map<string, IntradayFloatingBreakdownEntry>;
  hasTradesData: boolean;
};

export function buildTradeBasedIntradayFloatingBreakdown(
  params: {
    trades: EnrichedTrade[];
    positions: Position[];
    todayStr: string;
    markBySymbol?: Map<string, number> | Record<string, number>;
    multiplierBySymbol?: Record<string, number>;
  },
): TradeBasedIntradayFloatingBreakdownDataset {
  const context = buildTradeBasedIntradayFloatingContext(params);
  return buildTradeBasedIntradayFloatingBreakdownFromContext(context, params);
}

export function buildTradeBasedIntradayFloatingBreakdownFromContext(
  context: TradeBasedIntradayContext | null | undefined,
  params: {
    positions: Position[];
    markBySymbol?: Map<string, number> | Record<string, number>;
    multiplierBySymbol?: Record<string, number>;
  },
): TradeBasedIntradayFloatingBreakdownDataset {
  const map = new Map<string, IntradayFloatingBreakdownEntry>();
  if (!context) {
    return { values: map, hasTradesData: false };
  }

  const { positions, markBySymbol, multiplierBySymbol } = params;

  for (const pos of positions ?? []) {
    const key = normalizeSymbol(pos?.symbol);
    if (!key) continue;
    const markOverride = getMarkOverride(markBySymbol, key);
    const markCandidate = Number.isFinite(markOverride)
      ? (markOverride as number)
      : Number(pos?.last);
    const entry = calculateTradeBasedIntradayFloatingEntry(context, {
      symbol: key,
      qty: Number(pos?.qty ?? 0),
      mark: markCandidate,
      prevClose: pos?.prevClose,
      multiplier: multiplierBySymbol?.[key],
    });
    if (entry) {
      map.set(key, entry);
    }
  }

  return { values: map, hasTradesData: context.hasTradesData };
}

export type TradeBasedIntradayPnlDataset = {
  values: Map<string, number>;
  hasTradesData: boolean;
};

export function buildTradeBasedIntradayFloatingPnlMap(
  params: {
    trades: EnrichedTrade[];
    positions: Position[];
    todayStr: string;
    markBySymbol?: Map<string, number> | Record<string, number>;
    multiplierBySymbol?: Record<string, number>;
  },
): TradeBasedIntradayPnlDataset {
  const breakdown = buildTradeBasedIntradayFloatingBreakdown(params);
  const map = new Map<string, number>();
  for (const [key, entry] of breakdown.values) {
    map.set(key, entry.floating);
  }
  return { values: map, hasTradesData: breakdown.hasTradesData };
}

export type IntradayValueResult =
  | { status: "ok"; value: number }
  | { status: "missing"; reason: "invalid_symbol" | "missing_legs" | "missing_symbol"; message: string };

export function calculateIntradayValue(
  pos: Position,
  dataset: IntradayPnlDataset,
): IntradayValueResult {
  const key = normalizeSymbol(pos.symbol);

  if (!key) {
    return {
      status: "missing",
      reason: "invalid_symbol",
      message: "缺少持仓代码，无法匹配当日盈亏拆解，请补充 symbol。",
    };
  }

  const legValue = dataset.values.get(key);
  if (Number.isFinite(legValue)) {
    return { status: "ok", value: legValue as number };
  }

  if (!dataset.hasLegsData) {
    return {
      status: "missing",
      reason: "missing_legs",
      message: "缺少 M6 legs 拆解数据，请补充隔夜与当日未平拆解后再查看当日盈亏。",
    };
  }

  return {
    status: "missing",
    reason: "missing_symbol",
    message: `缺少 ${key} 的 M6 legs 拆解，请补充该标的的隔夜与当日未平拆解数据。`,
  };
}
