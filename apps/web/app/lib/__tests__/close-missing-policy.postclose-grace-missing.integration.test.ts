import { generateDailyResults, type DailyResultsDiagnostics } from "@/app/lib/dailyResults";
import { resolveCloseGraceMinutes } from "@/app/lib/marketHours";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("close missing policy - post close grace", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-10-07T22:00:00Z")); // 18:00 NY time
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("flags missing closes only after the grace window", () => {
    const positions: Position[] = [
      { symbol: "TSLA", qty: 2, avgPrice: 200, last: 210, priceOk: true },
    ];
    const diagnostics: DailyResultsDiagnostics = { missingCloses: [], pendingCloses: [] };
    const trades: EnrichedTrade[] = [
      {
        symbol: "TSLA",
        price: 200,
        quantity: 2,
        date: "2025-10-06T19:30:00Z",
        action: "buy",
        realizedPnl: 0,
        quantityAfter: 2,
        averageCost: 200,
        amount: 400,
        breakEvenPrice: 200,
        weekday: 1,
        tradeCount: 1,
      } as EnrichedTrade,
    ];

    generateDailyResults(
      {
        trades,
        positions,
        closePrices: { TSLA: { "2025-10-06": 215 } },
        evalDate: "2025-10-07",
      },
      diagnostics,
    );

    expect(diagnostics.missingCloses).toContainEqual({
      symbol: "TSLA",
      ymd: "2025-10-07",
      fallback: "OFFICIAL_CLOSE",
    });
    expect(diagnostics.pendingCloses?.find((entry) => entry.date === "2025-10-07")).toBeUndefined();
    expect(diagnostics.closeWindow).toMatchObject({
      date: "2025-10-07",
      isTradingDay: true,
      requireOfficialClose: true,
      missingClose: true,
    });
    expect(diagnostics.closeWindow?.windowEndTs).toBeGreaterThan(0);
    expect(diagnostics.closeWindow?.graceMinutes).toBe(resolveCloseGraceMinutes());
    expect(diagnostics.closeWindow?.graceMinutes).toBeGreaterThanOrEqual(0);
  });
});
