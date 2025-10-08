export class NoPriceError extends Error {
  constructor(message = 'no price') {
    super(message);
    this.name = 'NoPriceError';
  }
}

export class MissingOfficialCloseError extends Error {
  constructor(message = 'official close price is required') {
    super(message);
    this.name = 'MissingOfficialCloseError';
  }
}

type SafePriceMode = 'strict' | 'legacy';

function resolveSafePriceMode(): SafePriceMode {
  const raw = process.env.SAFE_PRICE_MODE?.toLowerCase();
  if (raw === 'legacy') return 'legacy';
  return 'strict';
}

function isStrictSafePriceMode(): boolean {
  return resolveSafePriceMode() === 'strict';
}

export interface SafePriceInput {
  quote?: number | null;
  lastClose?: number | null;
}

export interface SafePriceResult {
  price: number;
  stale: boolean;
}

/**
 * Return a safe price with fallback to last close.
 * If quote is provided and finite, use it and stale=false.
 * If quote is missing but lastClose is provided, use lastClose and mark stale=true.
 * Otherwise throw {@link NoPriceError}.
 */
export function getSafePrice({ quote, lastClose }: SafePriceInput): SafePriceResult {
  if (typeof quote === 'number' && Number.isFinite(quote)) {
    return { price: quote, stale: false };
  }
  if (isStrictSafePriceMode()) {
    throw new MissingOfficialCloseError();
  }
  if (typeof lastClose === 'number' && Number.isFinite(lastClose)) {
    return { price: lastClose, stale: true };
  }
  throw new NoPriceError();
}
