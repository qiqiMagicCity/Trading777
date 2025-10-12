import type { Position } from "@/app/lib/services/dataService";
import { fmtNY } from "@/app/lib/time";
import type {
  M123Snapshot,
  M1toM3Meta,
} from "@/app/lib/types/metrics";

const pickMultiplier = (position: Position): number => {
  const candidate = position?.multiplier;
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  const instrument = typeof position?.instrumentType === "string"
    ? position.instrumentType.trim().toLowerCase()
    : "";
  if (instrument === "option") {
    return 100;
  }
  return 1;
};

const resolveNyTimestamp = (value?: number): string | null => {
  if (!Number.isFinite(value)) return null;
  try {
    return fmtNY(value as number);
  } catch {
    return null;
  }
};

export function calcM1M2M3(positions: readonly Position[]): M123Snapshot {
  let m1 = 0;
  let m2 = 0;
  let directional = 0;
  let nominal = 0;
  let lastNy: string | null = null;
  let hasStale = false;
  const staleSymbols = new Set<string>();

  for (const raw of positions) {
    if (!raw) continue;
    const qty = Number(raw.qty);
    const avgPrice = Number(raw.avgPrice);
    if (!Number.isFinite(qty) || !Number.isFinite(avgPrice) || qty === 0) {
      continue;
    }
    const absQty = Math.abs(qty);
    const multiplier = pickMultiplier(raw);
    m1 += absQty * avgPrice * multiplier;

    const resolvedLast = Number(raw.last);
    const hasPrice = Number.isFinite(resolvedLast);
    if (!hasPrice) {
      continue;
    }

    m2 += absQty * resolvedLast * multiplier;
    const delta = (resolvedLast - avgPrice) * multiplier;
    directional += qty * delta;
    const nominalDelta = absQty * (qty >= 0 ? delta : -delta);
    nominal += nominalDelta;

    if (raw.stale || raw.priceOk === false) {
      hasStale = true;
      staleSymbols.add(raw.symbol);
    }

    if (Number.isFinite(raw.lastUpdatedAt)) {
      const formatted = resolveNyTimestamp(raw.lastUpdatedAt);
      if (formatted && (!lastNy || formatted > lastNy)) {
        lastNy = formatted;
      }
    }
  }

  const meta: M1toM3Meta = {
    priceStatus: hasStale ? "stale" : "live",
    lastPriceAtNY: lastNy,
    ...(staleSymbols.size > 0 ? { staleSymbols: Array.from(staleSymbols) } : {}),
  };

  return {
    m1,
    m2,
    m3: { dir: directional, nominal },
    meta,
  };
}
