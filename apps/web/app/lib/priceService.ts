export class MissingPriceError extends Error {
  constructor(message = 'missing price') {
    super(message);
    this.name = 'MissingPriceError';
  }
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
 * Otherwise throw {@link MissingPriceError}.
 */
export function getSafePrice({ quote, lastClose }: SafePriceInput): SafePriceResult {
  if (typeof quote === 'number' && Number.isFinite(quote)) {
    return { price: quote, stale: false };
  }
  if (typeof lastClose === 'number' && Number.isFinite(lastClose)) {
    return { price: lastClose, stale: true };
  }
  throw new MissingPriceError();
}
