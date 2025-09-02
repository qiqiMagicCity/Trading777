import { runAll, getReplayDays, RawTrade, ClosePriceMap } from "../runAll";
import { normalizeMetrics } from "@/app/lib/metrics";
import type { InitialPosition } from "../fifo";

const EPS = 1e-6;

describe("replay days generation", () => {
  it("creates record even when no trades", async () => {
    const prices: ClosePriceMap = { AAA: { "2024-01-01": 11 } };
    const trades: RawTrade[] = [];
    const days = getReplayDays("2024-01-01", "2024-01-01", trades, prices);
    expect(days).toEqual(["2024-01-01"]);
    const positions: InitialPosition[] = [{ symbol: "AAA", qty: 1, avgPrice: 10 }];
    const daily: any[] = [];
    for (const d of days) {
      const res = await runAll(d, positions, trades, prices, { dailyResults: daily }, { evalDate: d });
      const m = normalizeMetrics(res);
      const totalRealized = m.M4.total + m.M5.fifo;
      const prevReal = daily.reduce((s: number, r: any) => s + r.realized, 0);
      const realized = Math.round((totalRealized - prevReal) * 100) / 100;
      const unrealized = Math.round(m.M3 * 100) / 100;
      daily.push({ date: d, realized, unrealized });
    }
    expect(daily).toEqual([{ date: "2024-01-01", realized: 0, unrealized: 1 }]);
  });

  it("mixed days produce M9 approx realized+unrealized on final day", async () => {
    const prices: ClosePriceMap = {
      AAA: { "2024-01-01": 10, "2024-01-02": 10, "2024-01-03": 11 },
    };
    const trades: RawTrade[] = [
      { date: "2024-01-01", side: "BUY", symbol: "AAA", qty: 1, price: 10 },
      { date: "2024-01-03", side: "SELL", symbol: "AAA", qty: 1, price: 11 },
    ];
    const days = getReplayDays("2024-01-01", "2024-01-03", trades, prices);
    const daily: any[] = [];
    const positions: InitialPosition[] = [];
    for (const d of days) {
      const relevantTrades = trades.filter(t => t.date <= d);
      const res = await runAll(d, positions, relevantTrades, prices, { dailyResults: daily }, { evalDate: d });
      const m = normalizeMetrics(res);
      const totalRealized = m.M4.total + m.M5.fifo;
      const prevReal = daily.reduce((s: number, r: any) => s + r.realized, 0);
      const realized = Math.round((totalRealized - prevReal) * 100) / 100;
      const unrealized = Math.round(m.M3 * 100) / 100;
      daily.push({ date: d, realized, unrealized });
    }
    const lastDay = days[days.length - 1];
    const finalRes = await runAll(lastDay, positions, trades, prices, { dailyResults: daily }, { evalDate: lastDay });
    const finalM = normalizeMetrics(finalRes);
    const last = daily[daily.length - 1];
    expect(Math.abs((finalM.M9 ?? 0) - (last.realized + last.unrealized))).toBeLessThan(EPS);
    expect(daily.length).toBe(3);
  });
});
