import { round2 } from "./money";

export interface M6PositionInput {
  symbol: string;
  qty: number;
  priceNow: number | null;
  prevClose: number | null;
  fx?: number | null;
}

export interface M6Inputs {
  positions: M6PositionInput[];
  M4: number;
  M5_FIFO: number;
  fallbackOpen?: (symbol: string) => number | null;
  nowMarkFallback?: (symbol: string) => number | null;
}

export interface CalcM6Warning {
  symbol: string;
  reason: "MISSING_PREV_CLOSE" | "MISSING_MARK";
}

export interface CalcM6Leg {
  symbol: string;
  qty: number;
  prevClose: number;
  priceNow: number;
  fx: number;
  mtm: number;
}

export interface CalcM6DetailedResult {
  total: number;
  mtm: number;
  legs: CalcM6Leg[];
  warnings: CalcM6Warning[];
}

function resolvePrice(
  explicit: number | null,
  fallback: ((symbol: string) => number | null) | undefined,
  symbol: string,
): { value: number | null; usedFallback: boolean } {
  if (explicit != null && Number.isFinite(explicit)) {
    return { value: explicit, usedFallback: false };
  }
  if (!fallback) return { value: null, usedFallback: false };
  const px = fallback(symbol);
  if (px != null && Number.isFinite(px)) {
    return { value: px, usedFallback: true };
  }
  return { value: null, usedFallback: false };
}

export function calcM6Detailed(input: M6Inputs): CalcM6DetailedResult {
  let mtm = 0;
  const legs: CalcM6Leg[] = [];
  const warnings: CalcM6Warning[] = [];

  for (const item of input.positions) {
    const qty = Number(item.qty ?? 0);
    if (!Number.isFinite(qty) || qty === 0) {
      continue;
    }

    const { value: prevClose, usedFallback: usedPrevFallback } = resolvePrice(
      item.prevClose,
      input.fallbackOpen,
      item.symbol,
    );
    if (prevClose == null) {
      warnings.push({ symbol: item.symbol, reason: "MISSING_PREV_CLOSE" });
      console.warn?.(
        "calcM6: missing prevClose (and fallback open) for symbol",
        item.symbol,
      );
      continue;
    }
    if (usedPrevFallback) {
      console.warn?.(
        "calcM6: prevClose missing, using fallback open for symbol",
        item.symbol,
      );
    }

    const { value: priceNow } = resolvePrice(
      item.priceNow,
      input.nowMarkFallback,
      item.symbol,
    );
    if (priceNow == null) {
      warnings.push({ symbol: item.symbol, reason: "MISSING_MARK" });
      console.warn?.(
        "calcM6: missing priceNow (and fallback mark) for symbol",
        item.symbol,
      );
      continue;
    }

    const fx = Number.isFinite(item.fx ?? NaN) ? Number(item.fx) : 1;
    const legMtm = (priceNow - prevClose) * qty * fx;
    mtm += legMtm;
    legs.push({
      symbol: item.symbol,
      qty,
      prevClose,
      priceNow,
      fx,
      mtm: legMtm,
    });
  }

  const total = round2(input.M4 + input.M5_FIFO + mtm);
  return { total, mtm, legs, warnings };
}

export function calcM6(input: M6Inputs): number {
  return calcM6Detailed(input).total;
}

