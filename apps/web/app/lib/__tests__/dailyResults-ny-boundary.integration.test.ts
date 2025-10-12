import { generateDailyResults } from "@/app/lib/dailyResults";
import type { EnrichedTrade } from "@/lib/fifo";

type PartialTrade = Partial<EnrichedTrade> & Pick<EnrichedTrade, "date" | "action">;

const baseTrade = (overrides: PartialTrade): EnrichedTrade =>
  ({
    id: 1,
    symbol: "T",
    price: 100,
    quantity: 1,
    date: "2024-05-08T14:00:00-04:00",
    action: "buy",
    realizedPnl: 0,
    quantityAfter: 1,
    averageCost: 100,
    weekday: 3,
    tradeCount: 1,
    amount: 100,
    breakEvenPrice: 100,
    accTotalCost: 0,
    accRealizedPnl: 0,
    netPosition: 1,
    ...overrides,
  }) as EnrichedTrade;

describe("generateDailyResults New York day boundaries", () => {
  it("keeps 20:30 ET trades within the same calendar day", () => {
    const trades: EnrichedTrade[] = [
      baseTrade({
        id: 1,
        action: "buy",
        date: "2024-05-08T09:45:00-04:00",
        realizedPnl: 0,
        quantityAfter: 1,
      }),
      baseTrade({
        id: 2,
        action: "sell",
        date: "2024-05-08T20:30:00-04:00",
        price: 110,
        realizedPnl: 10,
        quantityAfter: 0,
        netPosition: 0,
        tradeCount: 2,
      }),
    ];

    const results = generateDailyResults(
      {
        trades,
        positions: [],
        closePrices: {},
        evalDate: "2024-05-08",
      },
      { missingCloses: [] },
    );

    const target = results.find((row) => row.date === "2024-05-08");
    expect(target).toBeDefined();
    expect(target?.realized).toBe(10);
    expect(results.some((row) => row.date === "2024-05-09")).toBe(false);
  });
});
