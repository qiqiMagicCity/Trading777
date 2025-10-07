import { calcMetrics, normalizeMetrics } from "@/app/lib/metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("calcMetrics official close enforcement", () => {
  const baseEvalDate = "2024-01-03";

  const createPosition = (overrides: Partial<Position>): Position => ({
    symbol: "AAPL",
    qty: 10,
    avgPrice: 100,
    last: 102,
    priceOk: true,
    prevClose: 100,
    ...overrides,
  });

  it("uses official prev close when available", () => {
    const positions: Position[] = [createPosition({})];
    const metrics = calcMetrics([], positions, [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {
        AAPL: {
          "2024-01-02": 100,
        },
      },
    });
    const normalized = normalizeMetrics(metrics);
    expect(normalized._m6?.mtmOvernight).toBeCloseTo(20, 6);
    expect(normalized.diagnostics?.missingOfficialCloses).toBeUndefined();
  });

  it("records diagnostics and zeroes overnight when official close is missing", () => {
    const positions: Position[] = [createPosition({})];
    const metrics = calcMetrics([], positions, [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {},
    });
    const normalized = normalizeMetrics(metrics);
    expect(normalized._m6?.mtmOvernight).toBe(0);
    const diag = normalized.diagnostics?.missingOfficialCloses ?? [];
    expect(diag).toHaveLength(1);
    expect(diag[0]).toMatchObject({
      symbol: "AAPL",
      date: "2024-01-02",
      impact: ["M4今日退化（过夜=0）", "M6过夜桶=0"],
      purposes: ["M6"],
      hasFallback: true,
    });
  });

  it("does not produce diagnostics for intraday-only trades", () => {
    const trades: EnrichedTrade[] = [
      {
        action: "buy",
        amount: 1000,
        averageCost: 100,
        breakEvenPrice: 100,
        date: `${baseEvalDate}T10:00:00Z`,
        id: 1,
        price: 100,
        quantity: 10,
        quantityAfter: 10,
        realizedPnl: 0,
        symbol: "AAPL",
        time: `${baseEvalDate}T10:00:00Z`,
        weekday: 3,
      },
      {
        action: "sell",
        amount: 1050,
        averageCost: 100,
        breakEvenPrice: 100,
        date: `${baseEvalDate}T15:30:00Z`,
        id: 2,
        price: 105,
        quantity: 10,
        quantityAfter: 0,
        realizedPnl: 50,
        symbol: "AAPL",
        time: `${baseEvalDate}T15:30:00Z`,
        weekday: 3,
      },
    ];
    const metrics = calcMetrics(trades, [], [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {},
    });
    const normalized = normalizeMetrics(metrics);
    expect(normalized.diagnostics?.missingOfficialCloses).toBeUndefined();
  });
});
