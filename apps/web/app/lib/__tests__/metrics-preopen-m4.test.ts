import { calcMetrics } from "../metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import * as timezone from "@/lib/timezone";

describe("M4 pre-open behavior", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should keep previous trading day's M4 before market opens", () => {
    jest
      .spyOn(timezone, "nowNY")
      .mockReturnValue(new Date("2025-09-25T08:22:00-04:00"));

    const trades: EnrichedTrade[] = [
      {
        id: 1,
        symbol: "AAPL",
        action: "buy",
        price: 10,
        quantity: 100,
        date: "2025-09-23T10:00:00-04:00",
        weekday: 2,
        tradeCount: 1,
        amount: 1000,
        breakEvenPrice: 10,
        breakEvenJ: 10,
        breakEvenJSticky: 10,
        realizedPnl: 0,
        quantityAfter: 100,
        averageCost: 10,
        accTotalCost: 1000,
        accRealizedPnl: 0,
        netPosition: 100,
      },
      {
        id: 2,
        symbol: "AAPL",
        action: "sell",
        price: 12,
        quantity: 100,
        date: "2025-09-24T15:59:00-04:00",
        weekday: 3,
        tradeCount: 2,
        amount: 1200,
        breakEvenPrice: 10,
        breakEvenJ: undefined,
        breakEvenJSticky: 10,
        realizedPnl: 200,
        quantityAfter: 0,
        averageCost: 10,
        accTotalCost: 0,
        accRealizedPnl: 200,
        netPosition: 0,
      },
    ];

    const positions: Position[] = [];

    const metrics = calcMetrics(trades, positions, []);

    expect(metrics.M4).toBe(200);
  });

  it("should fall back to the last trade day when freeze date jumps ahead", () => {
    const prevFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
    process.env.NEXT_PUBLIC_FREEZE_DATE = "2025-09-25";

    try {
      jest
        .spyOn(timezone, "nowNY")
        .mockReturnValue(new Date("2025-09-24T20:22:00-04:00"));

      const trades: EnrichedTrade[] = [
        {
          id: 1,
          symbol: "AAPL",
          action: "buy",
          price: 10,
          quantity: 100,
          date: "2025-09-23",
          weekday: 2,
          tradeCount: 1,
          amount: 1000,
          breakEvenPrice: 10,
          breakEvenJ: 10,
          breakEvenJSticky: 10,
          realizedPnl: 0,
          quantityAfter: 100,
          averageCost: 10,
          accTotalCost: 1000,
          accRealizedPnl: 0,
          netPosition: 100,
        },
        {
          id: 2,
          symbol: "AAPL",
          action: "sell",
          price: 12,
          quantity: 100,
          date: "2025-09-24",
          weekday: 3,
          tradeCount: 2,
          amount: 1200,
          breakEvenPrice: 10,
          breakEvenJ: undefined,
          breakEvenJSticky: 10,
          realizedPnl: 200,
          quantityAfter: 0,
          averageCost: 10,
          accTotalCost: 0,
          accRealizedPnl: 200,
          netPosition: 0,
        },
      ];

      const positions: Position[] = [];

      const metrics = calcMetrics(trades, positions, []);

      expect(metrics.M4).toBe(200);
    } finally {
      if (prevFreeze === undefined) {
        delete process.env.NEXT_PUBLIC_FREEZE_DATE;
      } else {
        process.env.NEXT_PUBLIC_FREEZE_DATE = prevFreeze;
      }
    }
  });
});
