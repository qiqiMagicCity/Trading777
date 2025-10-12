import { calcMetrics, normalizeMetrics } from "@/app/lib/metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("M4_today direction and consistency", () => {
  const baseEvalDate = "2024-09-24";

  it("keeps long overnight and intraday buckets oriented without double counting", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "LONG",
        action: "buy",
        quantity: 10,
        price: 100,
        date: "2024-09-23T15:30:00Z",
        time: "2024-09-23T15:30:00Z",
        isInitialPosition: true,
      } as any,
      {
        symbol: "LONG",
        action: "sell",
        quantity: 4,
        price: 108,
        date: `${baseEvalDate}T19:00:00Z`,
        time: `${baseEvalDate}T19:00:00Z`,
      } as any,
      {
        symbol: "LONG",
        action: "buy",
        quantity: 6,
        price: 107,
        date: `${baseEvalDate}T20:00:00Z`,
        time: `${baseEvalDate}T20:00:00Z`,
      } as any,
    ];

    const positions: Position[] = [
      {
        symbol: "LONG",
        qty: 12,
        avgPrice: 102,
        last: 110,
        priceOk: true,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, positions, [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {
        LONG: {
          "2024-09-23": 100,
        },
      },
    });

    const normalized = normalizeMetrics(metrics);

    expect(normalized._m6?.realizedToday).toBeCloseTo(32, 6);
    expect(normalized._m6?.mtmOvernight).toBeCloseTo(60, 6);
    expect(normalized._m6?.mtmIntradayOpen).toBeCloseTo(18, 6);
    expect(normalized.M4_today.total).toBeCloseTo(110, 6);
    expect(normalized.M4_today.degraded).toBe(false);

    const legs = normalized.aux?.m6Legs ?? [];
    const overnightLeg = legs.find(
      (leg) => leg.symbol === "LONG" && leg.component === "mtm_overnight",
    );
    expect(overnightLeg).toMatchObject({ qty: 6, direction: "long" });
    const intradayLeg = legs.find(
      (leg) => leg.symbol === "LONG" && leg.component === "mtm_intraday_open",
    );
    expect(intradayLeg).toMatchObject({ qty: 6, direction: "long" });
  });

  it("computes short overnight scenarios with correct signs and realized totals", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "SHORT",
        action: "short",
        quantity: 20,
        price: 50,
        date: "2024-09-23T15:30:00Z",
        time: "2024-09-23T15:30:00Z",
        isInitialPosition: true,
      } as any,
      {
        symbol: "SHORT",
        action: "cover",
        quantity: 5,
        price: 48,
        date: `${baseEvalDate}T14:30:00Z`,
        time: `${baseEvalDate}T14:30:00Z`,
      } as any,
      {
        symbol: "SHORT",
        action: "short",
        quantity: 6,
        price: 47,
        date: `${baseEvalDate}T15:15:00Z`,
        time: `${baseEvalDate}T15:15:00Z`,
      } as any,
    ];

    const positions: Position[] = [
      {
        symbol: "SHORT",
        qty: -21,
        avgPrice: 48,
        last: 45,
        priceOk: true,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, positions, [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {
        SHORT: {
          "2024-09-23": 50,
        },
      },
    });

    const normalized = normalizeMetrics(metrics);

    expect(normalized._m6?.realizedToday).toBeCloseTo(10, 6);
    expect(normalized._m6?.mtmOvernight).toBeCloseTo(75, 6);
    expect(normalized._m6?.mtmIntradayOpen).toBeCloseTo(12, 6);
    expect(normalized.M4_today.total).toBeCloseTo(97, 6);
    expect(normalized.M4_today.degraded).toBe(false);

    const legs = normalized.aux?.m6Legs ?? [];
    const overnightLeg = legs.find(
      (leg) => leg.symbol === "SHORT" && leg.component === "mtm_overnight",
    );
    expect(overnightLeg).toMatchObject({ direction: "short" });
    const intradayLeg = legs.find(
      (leg) => leg.symbol === "SHORT" && leg.component === "mtm_intraday_open",
    );
    expect(intradayLeg).toMatchObject({ qty: 6, direction: "short" });
  });

  it("treats intraday round-trips as realized only without degradation", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "INTRA",
        action: "buy",
        quantity: 10,
        price: 10,
        date: `${baseEvalDate}T14:00:00Z`,
        time: `${baseEvalDate}T14:00:00Z`,
      } as any,
      {
        symbol: "INTRA",
        action: "sell",
        quantity: 10,
        price: 12,
        date: `${baseEvalDate}T19:00:00Z`,
        time: `${baseEvalDate}T19:00:00Z`,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, [], [], {
      periodEvalYmd: baseEvalDate,
      tradingDateStr: baseEvalDate,
      officialCloseMap: {},
    });

    const normalized = normalizeMetrics(metrics);
    expect(normalized.M4_today.total).toBeCloseTo(20, 6);
    expect(normalized._m6?.mtmOvernight).toBeCloseTo(0, 6);
    expect(normalized._m6?.mtmIntradayOpen).toBeCloseTo(0, 6);
    expect(normalized.M4_today.degraded).toBe(false);
    expect(normalized.diagnostics?.missingOfficialCloses).toBeUndefined();
  });
});
