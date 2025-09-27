import { calcMetrics } from "../metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("M6 qty delta diagnostic", () => {
  it("prints currentQty vs yesterdayQty expected", () => {
    process.env.NEXT_PUBLIC_DEBUG_METRICS = "1";

    // 场景：昨收有 10 股多头，今早又买入 5 股；价格从昨收 100 涨到 102。
    const trades: EnrichedTrade[] = [
      // 昨日历史持仓通过 position 表示，不必放 initial lot 也可；若你的流水需要 initialPosition，可以加：
      {
        symbol: "AAA",
        action: "buy",
        quantity: 10,
        price: 100,
        date: "2024-09-23",
        time: "2024-09-23T14:31:00Z",
        isInitialPosition: true,
      } as any,
      // 今日再买 5 股
      {
        symbol: "AAA",
        action: "buy",
        quantity: 5,
        price: 101,
        date: "2024-09-24",
        time: "2024-09-24T14:31:00Z",
      } as any,
    ];

    const positions: Position[] = [
      // 盘中快照：当前共 15 股，昨收 100，现价 102
      { symbol: "AAA", qty: 15, avgPrice: 100, last: 102, prevClose: 100 } as any,
    ];

    const daily: any[] = [];
    const m = calcMetrics(trades as any, positions as any, daily);

    console.log("DIAG_M6", {
      M4: m.M4,
      M5: m.M5,
      M6: m.M6,
    });

    delete process.env.NEXT_PUBLIC_DEBUG_METRICS;
  });
});
