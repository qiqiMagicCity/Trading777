import Decimal from "decimal.js-light";

const ROUND4_SCALE = 4;

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return value;
  const result = new Decimal(value)
    .toDecimalPlaces(ROUND4_SCALE, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return normalizeNegativeZero(result);
}

export function add4(a: number, b: number): number {
  if (!Number.isFinite(a)) return round4(b);
  if (!Number.isFinite(b)) return round4(a);
  const result = new Decimal(a)
    .plus(b)
    .toDecimalPlaces(ROUND4_SCALE, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return normalizeNegativeZero(result);
}

export function sub4(a: number, b: number): number {
  return add4(a, -b);
}

export function mul4(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return NaN;
  }
  const result = new Decimal(a)
    .mul(b)
    .toDecimalPlaces(ROUND4_SCALE, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return normalizeNegativeZero(result);
}

export function div4(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) {
    return NaN;
  }
  const result = new Decimal(a)
    .div(b)
    .toDecimalPlaces(ROUND4_SCALE, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return normalizeNegativeZero(result);
}
