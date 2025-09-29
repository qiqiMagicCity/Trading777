import { calcMetrics, calcWtdMtdYtdFromSnapshots } from "@/app/lib/metrics";
import type { DailyResult } from "@/app/lib/types";

/**
 * 场景：用户大部分交易从 23 号开始录入，且当天 daily 记录为 ISO 带时区字符串。
 * 期望：WTD=周一起累计、MTD=月初累计、YTD=年初累计；至少 WTD 不会把当天漏掉。
 */
describe("WTD/MTD/YTD 应包含当天记录（无论 r.date 是否带时区）", () => {
  it("包含 2025-09-26 当天 ISO 记录", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-22", realized: 100, unrealized: 0, unrealizedDelta: 0 },
      { date: "2025-09-26T16:00:00-04:00", realized: 30, unrealized: 10, unrealizedDelta: 10 },
    ];
    const m = calcMetrics([], [], daily, { tradingDateStr: "2025-09-26" });
    expect(m.M11).toBe(140);
    expect(m.M12).toBeGreaterThanOrEqual(140);
    expect(m.M13).toBeGreaterThanOrEqual(140);
  });

  it("当 todayStr 因无当日交易而回退时 WTD/MTD/YTD 同步回退", () => {
    const trades = [
      {
        id: 1,
        symbol: "AAPL",
        action: "buy" as const,
        price: 10,
        quantity: 100,
        date: "2024-10-04T14:00:00-04:00",
        weekday: 5,
        tradeCount: 1,
        amount: 1000,
        breakEvenPrice: 10,
        realizedPnl: 0,
        quantityAfter: 100,
        averageCost: 10,
      },
    ];
    const daily: DailyResult[] = [
      { date: "2024-10-04", realized: 100, unrealized: 0, unrealizedDelta: 0 },
      { date: "2024-10-05", realized: 999, unrealized: 0, unrealizedDelta: 0 },
    ];

    const metrics = calcMetrics(trades as any, [], daily, {
      tradingDateStr: "2024-10-05",
    });

    const expected = calcWtdMtdYtdFromSnapshots(
      [daily[0]!],
      "2024-10-04",
    );

    expect(metrics.M11).toBe(expected.wtd);
    expect(metrics.M12).toBe(expected.mtd);
    expect(metrics.M13).toBe(expected.ytd);
    expect(metrics.M11).not.toBe(1099);
  });
});
