import { calcM6Detailed } from "../m6";
import { calcMetrics } from "../metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("calcM6Detailed pure scenarios", () => {
  it("示例A：只有过夜多头", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "AAPL", qty: 100, prevClose: 100, priceNow: 103 },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBeCloseTo(300, 6);
    expect(result.total).toBeCloseTo(300, 6);
  });

  it("示例B：纯日内开平（当日无持仓）", () => {
    const result = calcM6Detailed({
      positions: [],
      M4: 0,
      M5_FIFO: 120,
    });

    expect(result.mtm).toBeCloseTo(0, 6);
    expect(result.total).toBeCloseTo(120, 6);
  });

  it("示例C：今日新开多头仍持有", () => {
    const result = calcM6Detailed({
      positions: [
        {
          symbol: "NVDA",
          qty: 80,
          prevClose: 900,
          priceNow: 885,
          todayLongQty: 80,
          todayLongAvg: 890,
        },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBeCloseTo(-400, 6);
    expect(result.total).toBeCloseTo(-400, 6);
  });

  it("示例D：过夜空头 + 今日再加空", () => {
    const result = calcM6Detailed({
      positions: [
        {
          symbol: "XYZ",
          qty: -120,
          prevClose: 50,
          priceNow: 45,
          todayShortQty: 20,
          todayShortAvg: 47,
          overnightQty: -100,
        },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBeCloseTo(540, 6);
    expect(result.total).toBeCloseTo(540, 6);
    expect(result.legs).toHaveLength(2);
  });

  it("flip from long to short uses same-day cost basis", () => {
    const result = calcM6Detailed({
      positions: [
        {
          symbol: "FLIP",
          qty: -5,
          priceNow: 108,
          prevClose: 100,
          todayShortQty: 5,
          todayShortAvg: 110,
        },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBeCloseTo((110 - 108) * 5, 6);
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]?.component).toBe("TODAY_SHORT");
    expect(result.legs[0]?.prevClose).toBe(110);
  });

  it("overnight long fully closed then finishes net short", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "FLIPLS",
        action: "buy",
        quantity: 100,
        price: 90,
        date: "2024-09-23T14:30:00Z",
        time: "2024-09-23T14:30:00Z",
      } as any,
      {
        symbol: "FLIPLS",
        action: "sell",
        quantity: 150,
        price: 120,
        date: "2024-09-24T14:31:00Z",
        time: "2024-09-24T14:31:00Z",
      } as any,
    ];

    const positions: Position[] = [
      {
        symbol: "FLIPLS",
        qty: -50,
        avgPrice: 120,
        last: 110,
        prevClose: 90,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, positions as any, [], {
      tradingDateStr: "2024-09-24",
      periodEvalYmd: "2024-09-24",
      officialCloseMap: {
        FLIPLS: {
          "2024-09-23": 90,
        },
      },
    });

    const expectedM4 = (120 - 90) * 100; // close overnight long 100@90
    const expectedM5 = 0;
    const expectedMtm = (120 - 110) * 50; // today short 50@120 marked at 110

    expect(metrics.M4).toBeCloseTo(expectedM4, 6);
    expect(metrics.M5.fifo).toBeCloseTo(expectedM5, 6);
    expect(metrics.aux?.m6PriceChange ?? 0).toBeCloseTo(expectedMtm, 6);
    expect(metrics.M6).toBeCloseTo(expectedM4 + expectedM5 + expectedMtm, 6);

    const legs = metrics.aux?.m6Legs ?? [];
    const flipLeg = legs.find(
      (leg) => leg.symbol === "FLIPLS" && leg.component === "mtm_intraday_open",
    );
    expect(flipLeg).toMatchObject({ qty: 50, basis: 120, mark: 110 });
    expect(
      legs.some(
        (leg) =>
          leg.symbol === "FLIPLS" && leg.component === "mtm_overnight",
      ),
    ).toBe(false);
    expect(
      legs.some(
        (leg) =>
          leg.symbol === "FLIPLS" && leg.component === "realized_today",
      ),
    ).toBe(true);
  });

  it("overnight short fully closed then finishes net long", () => {
    const trades: EnrichedTrade[] = [
      {
        symbol: "FLIPSL",
        action: "short",
        quantity: -80,
        price: 200,
        date: "2024-09-23T14:30:00Z",
        time: "2024-09-23T14:30:00Z",
      } as any,
      {
        symbol: "FLIPSL",
        action: "cover",
        quantity: 120,
        price: 180,
        date: "2024-09-24T15:00:00Z",
        time: "2024-09-24T15:00:00Z",
      } as any,
    ];

    const positions: Position[] = [
      {
        symbol: "FLIPSL",
        qty: 40,
        avgPrice: 180,
        last: 190,
        prevClose: 200,
      } as any,
    ];

    const metrics = calcMetrics(trades as any, positions as any, [], {
      tradingDateStr: "2024-09-24",
      periodEvalYmd: "2024-09-24",
      officialCloseMap: {
        FLIPSL: {
          "2024-09-23": 200,
        },
      },
    });

    const expectedM4 = (200 - 180) * 80; // close overnight short 80@200
    const expectedM5 = 0;
    const expectedMtm = (190 - 180) * 40; // today long 40@180 marked at 190

    expect(metrics.M4).toBeCloseTo(expectedM4, 6);
    expect(metrics.M5.fifo).toBeCloseTo(expectedM5, 6);
    expect(metrics.aux?.m6PriceChange ?? 0).toBeCloseTo(expectedMtm, 6);
    expect(metrics.M6).toBeCloseTo(expectedM4 + expectedM5 + expectedMtm, 6);

    const legs = metrics.aux?.m6Legs ?? [];
    const todayLongLeg = legs.find(
      (leg) => leg.symbol === "FLIPSL" && leg.component === "mtm_intraday_open",
    );
    expect(todayLongLeg).toMatchObject({ qty: 40, basis: 180, mark: 190 });
    expect(
      legs.some(
        (leg) => leg.symbol === "FLIPSL" && leg.component === "mtm_overnight",
      ),
    ).toBe(false);
    expect(
      legs.some(
        (leg) =>
          leg.symbol === "FLIPSL" && leg.component === "realized_today",
      ),
    ).toBe(true);
  });
});
