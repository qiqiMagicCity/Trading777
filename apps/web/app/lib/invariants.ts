import { normalizeMetrics, projectToM6 } from "./metrics";
export function assertM6Equality(input:any){
  const m = normalizeMetrics(input);
  const priceChange = m.aux?.m6PriceChange;
  const realizedToday =
    typeof m.aux?.m6RealizedToday === 'number' && Number.isFinite(m.aux.m6RealizedToday)
      ? m.aux.m6RealizedToday
      : typeof m.M4?.total === 'number' && Number.isFinite(m.M4.total)
        ? m.M4.total
        : undefined;
  if (typeof priceChange !== 'number' || !Number.isFinite(priceChange)) {
    throw new Error('assertM6Equality failed: missing aux.m6PriceChange');
  }
  if (typeof realizedToday !== 'number') {
    throw new Error('assertM6Equality failed: missing aux.m6RealizedToday');
  }
  const lhs =
    Math.round((realizedToday + m.M5.fifo + priceChange) * 100) / 100;
  const rhs = Math.round(m.M6.total * 100) / 100;
  if (lhs !== rhs)
    throw new Error(
      `assertM6Equality failed: M6=${rhs} but realizedToday+M5.2+priceChange=${lhs}`,
    );
}
export { normalizeMetrics, projectToM6 };
