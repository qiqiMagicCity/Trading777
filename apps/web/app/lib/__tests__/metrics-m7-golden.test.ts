import { calcMetrics } from "@/lib/metrics";
import trades from "../../../public/trades.json";
import initial from "../../../public/initial_positions.json";
import type { Trade, Position } from "@/lib/services/dataService";

test("golden case M7 counts", () => {
  const formatted: Trade[] = (trades as any).map((t: any, idx: number) => ({
    id: idx,
    symbol: t.symbol,
    price: t.price,
    quantity: t.qty,
    date: t.date,
    action: t.side.toLowerCase() as Trade["action"],
  }));
  const metrics = calcMetrics(formatted as any, [] as Position[], [], initial as any);
  expect(metrics.M7).toEqual({ B: 6, S: 8, P: 4, C: 4, total: 22 });
});
