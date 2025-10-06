import { generateDailyResults, type DailyResultsDiagnostics } from "@/app/lib/dailyResults";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("close missing policy - preopen info", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-10-06T10:31:00Z")); // 06:31 NY time, pre-open Monday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("records pending close info instead of missing during pre-open", () => {
    const positions: Position[] = [
      { symbol: "AMZN", qty: 5, avgPrice: 120, last: 130, priceOk: true },
    ];
    const diagnostics: DailyResultsDiagnostics = { missingCloses: [], pendingCloses: [] };
    const trades: EnrichedTrade[] = [
      {
        symbol: "AMZN",
        price: 120,
        quantity: 5,
        date: "2025-10-03T19:30:00Z",
        action: "buy",
        realizedPnl: 0,
        quantityAfter: 5,
        averageCost: 120,
        amount: 600,
        breakEvenPrice: 120,
        weekday: 5,
        tradeCount: 1,
      } as EnrichedTrade,
    ];

    generateDailyResults(
      {
        trades,
        positions,
        closePrices: { AMZN: { "2025-10-03": 140 } },
        evalDate: "2025-10-06",
      },
      diagnostics,
    );

    expect(diagnostics.missingCloses).toHaveLength(0);
    const pending = diagnostics.pendingCloses?.find((entry) => entry.date === "2025-10-06");
    expect(pending).toBeDefined();
    expect(pending?.details).toContainEqual({
      symbol: "AMZN",
      fallbacks: ["MARK_PRICE"],
    });
    expect(diagnostics.closeWindow).toMatchObject({
      date: "2025-10-06",
      isTradingDay: true,
      requireOfficialClose: false,
      missingClose: false,
    });
  });
});
