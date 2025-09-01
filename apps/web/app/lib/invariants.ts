import { normalizeMetrics, projectToM6 } from "./metrics";
export function assertM6Equality(input:any){
  const m = normalizeMetrics(input);
  const lhs = Math.round((m.M4.total + m.M3 + m.M5.fifo) * 100) / 100;
  const rhs = Math.round(m.M6.total * 100) / 100;
  if (lhs !== rhs) throw new Error(`assertM6Equality failed: M6=${rhs} but M4+M3+M5.2=${lhs}`);
}
export { normalizeMetrics, projectToM6 };
