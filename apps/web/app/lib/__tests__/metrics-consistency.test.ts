import { calcPeriodMetrics, calcM9 } from "@/lib/metrics";
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

  it("calcPeriodMetrics returns 8952.5 for single-day sample", () => {
    const days: DailyResult[] = [
      { date: "2025-08-01", realized: 7850, unrealized: 1102.5 },
    ];
    const { wtd, mtd, ytd } = calcPeriodMetrics(days, "2025-08-01");
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

  it("calcWinLossLots returns expected counts", () => {
    const res = calcWinLossLots([{ pnl: 10 }, { pnl: -5 }, { pnl: 0 }]);
    expect(res).toEqual({ win: 1, loss: 1, flat: 1, rate: 0.5 });
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
