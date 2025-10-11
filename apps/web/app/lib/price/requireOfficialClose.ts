import type { ClosePriceMap } from "@/app/lib/dailyResults";
import type {
  MissingOfficialCloseDiagnostics,
  MissingOfficialClosePurpose,
} from "@/app/lib/diagnostics/reportMissingOfficialClose";
import {
  createMissingOfficialCloseDiagnostics,
  reportMissingOfficialClose,
} from "@/app/lib/diagnostics/reportMissingOfficialClose";
import { getOfficialCloseOverlayPrice } from "@/app/lib/officialCloseOverlayStore";
import { getAdjustmentFactor } from "@/app/lib/officialCloseAdjustments";
import { ymdInNY } from "@/lib/timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface OfficialCloseContext {
  map: ClosePriceMap;
  overlayMap?: ClosePriceMap;
  packagedMap?: ClosePriceMap;
  idbMap?: ClosePriceMap;
  diagnostics: MissingOfficialCloseDiagnostics;
  fallbackResolver?: (symbol: string, date: string) => boolean;
  closeWindowEvaluator?: (date: string) => boolean;
  resolveTargetDate?: (
    symbol: string,
    date: string,
    purpose: MissingOfficialClosePurpose,
  ) => string | undefined;
}

const EMPTY_CONTEXT: OfficialCloseContext = {
  map: {},
  overlayMap: {},
  diagnostics: createMissingOfficialCloseDiagnostics(),
};

let context: OfficialCloseContext = EMPTY_CONTEXT;

const normalizeSymbol = (value: string): string => value.trim().toUpperCase();

export function setOfficialCloseContext(
  newContext: OfficialCloseContext | null,
): () => void {
  const previous = context;
  context = newContext ?? EMPTY_CONTEXT;
  return () => {
    context = previous;
  };
}

export function requireOfficialClose(
  symbolInput: string,
  dateInput: string,
  purpose: MissingOfficialClosePurpose,
): { ok: true; price: number } | { ok: false; reason: "no_official_close" } {
  const symbol = normalizeSymbol(symbolInput ?? "");
  const rawDate = dateInput ?? "";
  const source = DATE_RE.test(rawDate) ? `${rawDate}T12:00:00Z` : rawDate;
  const nyDate = ymdInNY(source);
  const date = DATE_RE.test(nyDate) ? nyDate : "";
  if (!symbol || !DATE_RE.test(date)) {
    return { ok: false, reason: "no_official_close" };
  }

  const applyAdjustments = (price: number): number => {
    const targetCandidate = context.resolveTargetDate?.(symbol, date, purpose);
    const target =
      typeof targetCandidate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(targetCandidate)
        ? targetCandidate
        : date;
    const factor = getAdjustmentFactor(symbol, date, target);
    if (!Number.isFinite(factor) || factor <= 0) {
      return price;
    }
    return price * factor;
  };

  const overlayPrice = (() => {
    const fromContext = context.overlayMap?.[symbol]?.[date];
    if (typeof fromContext === "number" && Number.isFinite(fromContext)) {
      return fromContext;
    }
    const cached = getOfficialCloseOverlayPrice(symbol, date);
    return typeof cached === "number" && Number.isFinite(cached)
      ? cached
      : undefined;
  })();

  if (typeof overlayPrice === "number") {
    return { ok: true, price: applyAdjustments(overlayPrice) };
  }

  const price = context.map?.[symbol]?.[date];
  if (typeof price === "number" && Number.isFinite(price)) {
    return { ok: true, price: applyAdjustments(price) };
  }

  const packagedPrice = context.packagedMap?.[symbol]?.[date];
  if (typeof packagedPrice === "number" && Number.isFinite(packagedPrice)) {
    return { ok: true, price: applyAdjustments(packagedPrice) };
  }

  const idbPrice = context.idbMap?.[symbol]?.[date];
  if (typeof idbPrice === "number" && Number.isFinite(idbPrice)) {
    return { ok: true, price: applyAdjustments(idbPrice) };
  }

  const hasFallback = context.fallbackResolver?.(symbol, date) ?? false;
  const inWindow = context.closeWindowEvaluator?.(date) ?? false;
  const packagedAvailable =
    typeof packagedPrice === "number" && Number.isFinite(packagedPrice);
  const idbAvailable = typeof idbPrice === "number" && Number.isFinite(idbPrice);
  reportMissingOfficialClose(context.diagnostics, {
    symbol,
    date,
    purpose,
    hasFallback,
    status: inWindow ? "pending" : "missing",
    sources: {
      packagedPrice: packagedAvailable ? packagedPrice : undefined,
      idbPrice: idbAvailable ? idbPrice : undefined,
      fallbackAvailable: hasFallback,
    },
  });

  return { ok: false, reason: "no_official_close" };
}
