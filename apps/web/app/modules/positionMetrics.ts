import type { MetricsContract } from "@/app/lib/types/metrics";
import { round4 } from "@/app/lib/precision";
import type { Position } from "@/lib/services/dataService";

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
