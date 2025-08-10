import {
  calcM9,
  collectCloseLots,
  calcWtdMtdYtd,
  calcM9FromDaily,
} from "@/lib/metrics";
import { calcWinLossLots } from "@/lib/metrics-winloss";
import type { DailyResult } from "@/lib/types";
import { readFileSync } from "fs";
import path from "path";

describe("metrics consistency", () => {
  it("DailyResult matches metrics formula", () => {
    const metrics = { M4: 6530, M5: { fifo: 1320 }, M3: 1102.5 };
    const day: DailyResult = {
      date: "2025-08-01",
      realized: metrics.M4 + metrics.M5.fifo,
      unrealized: metrics.M3,
    };
    expect(day).toEqual({
      date: "2025-08-01",
      realized: 7850,
      unrealized: 1102.5,
    });
  });

  it("calcWtdMtdYtd returns 8952.5 for single-day sample", () => {
    const days: DailyResult[] = [
      { date: "2025-08-01", realized: 7850, unrealized: 1102.5 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(days, "2025-08-01");
    expect(wtd).toBe(8952.5);
    expect(mtd).toBe(8952.5);
    expect(ytd).toBe(8952.5);
  });

  it("calcM9 equals sum of all realized", () => {
    const days: DailyResult[] = [
      { date: "2025-08-01", realized: 7850, unrealized: 1102.5 },
      { date: "2025-08-02", realized: -100, unrealized: 0 },
    ];
    expect(calcM9(days)).toBe(7750);
  });

  it("calcM9FromDaily sums up to evaluation date", () => {
    const days: DailyResult[] = [
      { date: "2025-08-01", realized: 5000, unrealized: 0 },
      { date: "2025-08-02", realized: 1000, unrealized: 0 },
      { date: "2025-08-03", realized: 2000, unrealized: 0 },
    ];
    expect(calcM9FromDaily(days, "2025-08-02")).toBe(6000);
  });

  it("calcWinLossLots returns expected counts", () => {
    const res = calcWinLossLots([{ pnl: 10 }, { pnl: -5 }, { pnl: 0 }]);
    expect(res).toEqual({ win: 1, loss: 1, flat: 1, rate: 0.5 });
  });

  it("collectCloseLots produces lot-based win/loss counts", () => {
    const file = path.join(__dirname, "fixtures/trades-with-history.json");
    const { trades, positions } = JSON.parse(readFileSync(file, "utf8"));
    const enriched = trades.map((t: any, idx: number) => ({
      symbol: t.symbol,
      action: t.side.toLowerCase(),
      price: t.price,
      quantity: t.qty,
      date: `${t.date}Z`,
      idx,
    }));
    const initial = positions.map((p: any) => ({
      symbol: p.symbol,
      qty: p.qty,
      avgPrice: p.avgPrice,
    }));
    const closes = collectCloseLots(enriched, initial, "2025-08-01");
    const { win, loss, flat, rate } = calcWinLossLots(closes);
    expect({ win, loss, flat, rate: Number(rate.toFixed(3)) }).toEqual({
      win: 11,
      loss: 2,
      flat: 0,
      rate: 0.846,
    });
  });
});

describe("dailyResult.json schema", () => {
  it("contains only date, realized, unrealized keys", () => {
    const file = path.join(__dirname, "../../../public/dailyResult.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(Array.isArray(data)).toBe(true);
    for (const day of data) {
      expect(Object.keys(day).sort()).toEqual([
        "date",
        "realized",
        "unrealized",
      ]);
    }
  });
});
