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
  let originalFreeze: string | undefined;

  beforeEach(() => {
    originalFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
    delete process.env.NEXT_PUBLIC_FREEZE_DATE;
  });

  afterEach(() => {
    if (originalFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = originalFreeze;
    }
    jest.useRealTimers();
  });

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

  const evalDate = "2025-09-26";

  it("does not record MARK_PRICE fallback during market hours", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-09-26T18:00:00Z")); // 14:00 NY time

    const diagnostics: DailyResultsDiagnostics = { missingCloses: [], pendingCloses: [] };

    generateDailyResults(
      {
        trades,
        positions,
        closePrices: {},
        evalDate,
      },
      diagnostics,
    );

    expect(diagnostics.missingCloses).toContainEqual({
      symbol: "AMD",
      date: "2025-09-22",
      fallback: "AVERAGE_COST",
    });
    expect(diagnostics.missingCloses).not.toContainEqual({
      symbol: "AMD",
      date: "2025-09-26",
      fallback: "MARK_PRICE",
    });
    const pending = diagnostics.pendingCloses?.find((entry) => entry.date === evalDate);
    expect(pending).toBeUndefined();
    expect(diagnostics.closeWindow).toMatchObject({
      date: evalDate,
      isTradingDay: true,
      requireOfficialClose: false,
      missingClose: false,
    });
  });

  it("records PREVIOUS_CLOSE fallback after market close", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-09-26T22:00:00Z")); // 18:00 NY time

    const diagnostics: DailyResultsDiagnostics = { missingCloses: [], pendingCloses: [] };

    generateDailyResults(
      {
        trades,
        positions,
        closePrices: {},
        evalDate,
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
      fallback: "PREVIOUS_CLOSE",
    });
    expect(diagnostics.missingCloses).not.toContainEqual({
      symbol: "AMD",
      date: "2025-09-26",
      fallback: "MARK_PRICE",
    });
    expect(diagnostics.pendingCloses?.find((entry) => entry.date === evalDate)).toBeUndefined();
    expect(diagnostics.closeWindow).toMatchObject({
      date: evalDate,
      isTradingDay: true,
      requireOfficialClose: true,
      missingClose: true,
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
