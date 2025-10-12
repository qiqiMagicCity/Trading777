import { generateDailyResults, type DailyResultsDiagnostics } from "@/app/lib/dailyResults";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("close missing policy - weekend skip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-09-21T16:00:00Z")); // 12:00 NY time on Sunday
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("skips weekend diagnostics and carries forward Friday close", () => {
    const positions: Position[] = [
      { symbol: "AAPL", qty: 10, avgPrice: 100, last: 110, priceOk: true },
    ];
    const trades: EnrichedTrade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 10,
        date: "2025-09-19T14:30:00Z",
        action: "buy",
        realizedPnl: 0,
        quantityAfter: 10,
        averageCost: 100,
        amount: 1000,
        breakEvenPrice: 100,
        weekday: 5,
        tradeCount: 1,
      } as EnrichedTrade,
    ];
    const closePrices = {
      AAPL: {
        "2025-09-19": 125,
      },
    };
    const diagnostics: DailyResultsDiagnostics = { missingCloses: [], pendingCloses: [] };

    const results = generateDailyResults(
      {
        trades,
        positions,
        closePrices,
        evalDate: "2025-09-21",
      },
      diagnostics,
    );

    expect(diagnostics.missingCloses).toHaveLength(0);
    expect(diagnostics.pendingCloses).toHaveLength(0);
    expect(diagnostics.closeWindow).toMatchObject({
      date: "2025-09-21",
      isTradingDay: false,
      requireOfficialClose: false,
      missingClose: false,
    });

    const friday = results.find((row) => row.date === "2025-09-19");
    const sunday = results.find((row) => row.date === "2025-09-21");
    expect(friday?.unrealized).toBeDefined();
    expect(sunday?.unrealized).toBeDefined();
  });
});
