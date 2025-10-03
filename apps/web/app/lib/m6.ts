import { round2 } from "./money";
import { round4, add4, sub4, mul4 } from "./precision";

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

    const { value: prevCloseRaw, usedFallback: usedPrevFallback } = resolvePrice(
      item.prevClose,
      input.fallbackOpen,
      item.symbol,
    );

    const { value: priceNowRaw } = resolvePrice(
      item.priceNow,
      input.nowMarkFallback,
      item.symbol,
    );
    const priceNow = priceNowRaw != null ? round4(priceNowRaw) : null;
    if (priceNow == null) {
      warnings.push({ symbol: item.symbol, reason: "MISSING_MARK" });
      console.warn?.(
        "calcM6: missing priceNow (and fallback mark) for symbol",
        item.symbol,
      );
      continue;
    }

    const prevClose = prevCloseRaw != null ? round4(prevCloseRaw) : null;
    const fx = Number.isFinite(item.fx ?? NaN) ? Number(item.fx) : 1;
    const fxRounded = Number.isFinite(fx) ? round4(fx) : 1;
    let symbolMtm = 0;

    const pushLeg = (
      component: CalcM6Leg["component"],
      basis: number,
      quantity: number,
      legPnl: number,
    ) => {
      const roundedBasis = round4(basis);
      const roundedPnl = round4(legPnl);
      legs.push({
        symbol: item.symbol,
        qty: quantity,
        prevClose: roundedBasis,
        priceNow,
        fx: fxRounded,
        mtm: roundedPnl,
        component,
      });
      symbolMtm = add4(symbolMtm, roundedPnl);
    };

    const longQty = Math.max(0, todayLongQty);
    const shortQty = Math.max(0, todayShortQty);
    const longAvgRaw = Number(item.todayLongAvg ?? NaN);
    const shortAvgRaw = Number(item.todayShortAvg ?? NaN);
    const longAvg = Number.isFinite(longAvgRaw) ? round4(longAvgRaw) : NaN;
    const shortAvg = Number.isFinite(shortAvgRaw) ? round4(shortAvgRaw) : NaN;

    if (longQty > 0) {
      if (Number.isFinite(longAvg)) {
        const diff = sub4(priceNow, longAvg);
        const basePnl = mul4(diff, longQty);
        const legMtm = mul4(basePnl, fxRounded);
        if (Number.isFinite(legMtm)) {
          pushLeg("TODAY_LONG", longAvg, longQty, legMtm);
        }
      } else {
        warnings.push({
          symbol: item.symbol,
          reason: "MISSING_TODAY_LONG_COST",
        });
      }
    }

    if (shortQty > 0) {
      if (Number.isFinite(shortAvg)) {
        const diff = sub4(shortAvg, priceNow);
        const basePnl = mul4(diff, shortQty);
        const legMtm = mul4(basePnl, fxRounded);
        if (Number.isFinite(legMtm)) {
          pushLeg("TODAY_SHORT", shortAvg, shortQty, legMtm);
        }
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
          const diff = sub4(priceNow, prevClose);
          const basePnl = mul4(diff, overnightSigned);
          const legMtm = mul4(basePnl, fxRounded);
          if (Number.isFinite(legMtm)) {
            pushLeg("OVERNIGHT_LONG", prevClose, overnightSigned, legMtm);
          }
        } else {
          const absQty = Math.abs(overnightSigned);
          const diff = sub4(prevClose, priceNow);
          const basePnl = mul4(diff, absQty);
          const legMtm = mul4(basePnl, fxRounded);
          if (Number.isFinite(legMtm)) {
            pushLeg("OVERNIGHT_SHORT", prevClose, absQty, legMtm);
          }
        }
      }
    }

    symbolMtm = round4(symbolMtm);
    mtm = add4(mtm, symbolMtm);
  }

  mtm = round4(mtm);
  const total = round2(input.M4 + input.M5_FIFO + mtm);
  return { total, mtm, legs, warnings };
}

export function calcM6(input: M6Inputs): number {
  return calcM6Detailed(input).total;
}

