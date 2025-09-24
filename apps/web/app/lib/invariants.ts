import { normalizeMetrics, projectToM6 } from "./metrics";
export function assertM6Equality(input:any){
  const m = normalizeMetrics(input);
  const priceChange = m.aux?.m6PriceChange;
  const realizedUntilPrevClose =
    typeof m.aux?.m6RealizedUntilPrevClose === 'number'
      ? m.aux!.m6RealizedUntilPrevClose
      : undefined;
  if (typeof priceChange !== 'number' || !Number.isFinite(priceChange)) {
    throw new Error('assertM6Equality failed: missing aux.m6PriceChange');
  }
  if (typeof realizedUntilPrevClose !== 'number' || !Number.isFinite(realizedUntilPrevClose)) {
    throw new Error('assertM6Equality failed: missing aux.m6RealizedUntilPrevClose');
  }
  const lhs =
    Math.round((realizedUntilPrevClose + m.M5.fifo + priceChange) * 100) / 100;
  const rhs = Math.round(m.M6.total * 100) / 100;
  if (lhs !== rhs)
    throw new Error(
      `assertM6Equality failed: M6=${rhs} but realizedUntilPrevClose+M5.2+priceChange=${lhs}`,
    );
}
export { normalizeMetrics, projectToM6 };
