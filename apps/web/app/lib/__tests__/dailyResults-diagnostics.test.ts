import { generateDailyResults } from "@/app/lib/dailyResults";
import type { DailyResultsDiagnostics } from "@/app/lib/dailyResults";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import { summarizeMissingCloses } from "@/app/lib/missingClose";

function buildTrade(partial: Partial<EnrichedTrade>): EnrichedTrade {
  return {
    symbol: "AMD",
    price: 100,
    quantity: 10,
    date: "2025-09-22T14:30:00Z",
    action: "buy",
    realizedPnl: 0,
    quantityAfter: 10,
    averageCost: 100,
    amount: 1000,
    breakEvenPrice: 100,
    weekday: 1,
    tradeCount: 1,
    ...partial,
  } as EnrichedTrade;
}

describe("generateDailyResults diagnostics", () => {
  it("records fallback usage when close prices are missing", () => {
    const diagnostics: DailyResultsDiagnostics = { missingCloses: [] };
    const trades: EnrichedTrade[] = [buildTrade({})];
    const positions: Position[] = [
      {
        symbol: "AMD",
        qty: 10,
        avgPrice: 100,
        last: 105,
        priceOk: true,
      },
    ];

    generateDailyResults(
      {
        trades,
        positions,
        closePrices: {},
        evalDate: "2025-09-26",
      },
      diagnostics,
    );

    expect(diagnostics.missingCloses).toContainEqual({
      symbol: "AMD",
      date: "2025-09-22",
      fallback: "AVERAGE_COST",
    });
    expect(diagnostics.missingCloses).toContainEqual({
      symbol: "AMD",
      date: "2025-09-26",
      fallback: "MARK_PRICE",
    });
  });
});

describe("summarizeMissingCloses", () => {
  it("groups entries by date and symbol", () => {
    const entries = [
      { symbol: "AMD", date: "2025-09-22", fallback: "AVERAGE_COST" as const },
      { symbol: "AMD", date: "2025-09-26", fallback: "MARK_PRICE" as const },
      { symbol: "NVDA", date: "2025-09-26", fallback: "PREVIOUS_CLOSE" as const },
    ];

    const summaries = summarizeMissingCloses(entries);

    expect(summaries).toEqual([
      {
        date: "2025-09-22",
        symbols: [
          {
            symbol: "AMD",
            fallbacks: ["AVERAGE_COST"],
          },
        ],
      },
      {
        date: "2025-09-26",
        symbols: [
          {
            symbol: "AMD",
            fallbacks: ["MARK_PRICE"],
          },
          {
            symbol: "NVDA",
            fallbacks: ["PREVIOUS_CLOSE"],
          },
        ],
      },
    ]);
  });
});
