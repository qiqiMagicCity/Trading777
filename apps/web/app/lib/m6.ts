import { round2 } from "./money";

export interface M6PositionInput {
  symbol: string;
  /** 当前净持仓数量（多头为正，空头为负） */
  qty: number;
  /** 最新行情价（若缺失会尝试 fallback） */
  priceNow: number | null;
  /** 昨日收盘价（仅用于过夜仓，若缺失尝试 fallbackOpen） */
  prevClose: number | null;
  /** 今日新开仍未平的多头数量 */
  todayLongQty?: number | null;
  /** 今日新开仍未平的多头平均开仓价 */
  todayLongAvg?: number | null;
  /** 今日新开仍未平的空头数量（为正值，代表绝对数量） */
  todayShortQty?: number | null;
  /** 今日新开仍未平的空头平均开仓价 */
  todayShortAvg?: number | null;
  /** 指定过夜净仓数量（若缺失则由 qty 与今日新开数量推导） */
  overnightQty?: number | null;
  fx?: number | null;
}

export interface M6Inputs {
  positions: M6PositionInput[];
  M4: number;
  M5_FIFO: number;
  fallbackOpen?: (symbol: string) => number | null;
  nowMarkFallback?: (symbol: string) => number | null;
}

export type CalcM6WarningReason =
  | "MISSING_PREV_CLOSE"
  | "MISSING_MARK"
  | "MISSING_TODAY_LONG_COST"
  | "MISSING_TODAY_SHORT_COST";

export interface CalcM6Warning {
  symbol: string;
  reason: CalcM6WarningReason;
}

export interface CalcM6Leg {
  symbol: string;
  qty: number;
  /** 参考价：过夜仓为昨收价，今日仓为当日开仓均价 */
  prevClose: number;
  priceNow: number;
  fx: number;
  mtm: number;
  component: "OVERNIGHT_LONG" | "OVERNIGHT_SHORT" | "TODAY_LONG" | "TODAY_SHORT";
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
    const todayLongQtyRaw = Number(item.todayLongQty ?? 0);
    const todayShortQtyRaw = Number(item.todayShortQty ?? 0);
    const todayLongQty = Number.isFinite(todayLongQtyRaw) ? todayLongQtyRaw : 0;
    const todayShortQty = Number.isFinite(todayShortQtyRaw) ? todayShortQtyRaw : 0;
    const hasToday = Math.abs(todayLongQty) > 0 || Math.abs(todayShortQty) > 0;
    if (!Number.isFinite(qty) && !hasToday && !Number.isFinite(Number(item.overnightQty))) {
      continue;
    }
    if (!hasToday && !Number.isFinite(Number(item.overnightQty)) && (qty === 0 || !Number.isFinite(qty))) {
      continue;
    }

    const { value: prevClose, usedFallback: usedPrevFallback } = resolvePrice(
      item.prevClose,
      input.fallbackOpen,
      item.symbol,
    );

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
    let symbolMtm = 0;

    const pushLeg = (
      component: CalcM6Leg["component"],
      basis: number,
      quantity: number,
      legPnl: number,
    ) => {
      legs.push({
        symbol: item.symbol,
        qty: quantity,
        prevClose: basis,
        priceNow,
        fx,
        mtm: legPnl,
        component,
      });
      symbolMtm += legPnl;
    };

    const longQty = Math.max(0, todayLongQty);
    const shortQty = Math.max(0, todayShortQty);
    const longAvgRaw = Number(item.todayLongAvg ?? NaN);
    const shortAvgRaw = Number(item.todayShortAvg ?? NaN);
    const longAvg = Number.isFinite(longAvgRaw) ? longAvgRaw : NaN;
    const shortAvg = Number.isFinite(shortAvgRaw) ? shortAvgRaw : NaN;

    if (longQty > 0) {
      if (Number.isFinite(longAvg)) {
        const legMtm = (priceNow - Number(longAvg)) * longQty * fx;
        pushLeg("TODAY_LONG", Number(longAvg), longQty, legMtm);
      } else {
        warnings.push({
          symbol: item.symbol,
          reason: "MISSING_TODAY_LONG_COST",
        });
      }
    }

    if (shortQty > 0) {
      if (Number.isFinite(shortAvg)) {
        const legMtm = (Number(shortAvg) - priceNow) * shortQty * fx;
        pushLeg("TODAY_SHORT", Number(shortAvg), shortQty, legMtm);
      } else {
        warnings.push({
          symbol: item.symbol,
          reason: "MISSING_TODAY_SHORT_COST",
        });
      }
    }

    let overnightSigned: number | null = null;
    if (Number.isFinite(Number(item.overnightQty))) {
      overnightSigned = Number(item.overnightQty);
    } else if (Number.isFinite(qty)) {
      overnightSigned = qty - longQty + shortQty;
    }

    if (overnightSigned != null && Math.abs(overnightSigned) > 1e-9) {
      if (prevClose == null) {
        warnings.push({ symbol: item.symbol, reason: "MISSING_PREV_CLOSE" });
        console.warn?.(
          "calcM6: missing prevClose (and fallback open) for symbol",
          item.symbol,
        );
      } else {
        if (usedPrevFallback) {
          console.warn?.(
            "calcM6: prevClose missing, using fallback open for symbol",
            item.symbol,
          );
        }
        if (overnightSigned > 0) {
          const legMtm = (priceNow - prevClose) * overnightSigned * fx;
          pushLeg("OVERNIGHT_LONG", prevClose, overnightSigned, legMtm);
        } else {
          const absQty = Math.abs(overnightSigned);
          const legMtm = (prevClose - priceNow) * absQty * fx;
          pushLeg("OVERNIGHT_SHORT", prevClose, absQty, legMtm);
        }
      }
    }

    mtm += symbolMtm;
  }

  const total = round2(input.M4 + input.M5_FIFO + mtm);
  return { total, mtm, legs, warnings };
}

export function calcM6(input: M6Inputs): number {
  return calcM6Detailed(input).total;
}

