import type { Metrics } from "@/lib/metrics";
import type { Position } from "@/lib/services/dataService";

function normalizeSymbol(value: string | undefined | null): string {
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

export function buildIntradayPnlMap(metrics: Metrics | null | undefined): IntradayPnlDataset {
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
