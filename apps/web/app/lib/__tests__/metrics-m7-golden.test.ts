import { calcMetrics } from "@/lib/metrics";
import trades from "../../public/trades.json";
import initial from "../../public/initial_positions.json";

test('golden case M7 counts', () => {
  const metrics = calcMetrics(trades as any, [] as any, [], initial as any);
  expect(metrics.M7).toEqual({ B:6, S:8, P:4, C:4, total:22 });
});
