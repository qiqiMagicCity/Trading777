import {
  buildIntradayBreakdownMap,
  buildIntradayFloatingBreakdown,
  buildIntradayFloatingPnlMap,
  calculateIntradayValue,
  getResolvedPrice,
} from "../positionMetrics";
import type { Position } from "@/lib/services/dataService";

describe("position metrics helpers", () => {
  const basePosition: Position = {
    symbol: "TEST",
    qty: 10,
    avgPrice: 100,
    last: 100,
    priceOk: true,
  };

  it("部分平仓日仅返回浮动盈亏", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "TEST", qty: 10, basis: 100, mark: 105, amount: 50, component: "mtm_overnight" },
          { symbol: "test", qty: 5, basis: 102, mark: 105, amount: 15, component: "mtm_intraday_open" },
          { symbol: "TEST", qty: 2, basis: 103, mark: 105, amount: 8, component: "realized_today" },
          { symbol: "OTHER", qty: 1, basis: 20, mark: 21, amount: 5, component: "mtm_overnight" },
        ],
      },
    } as any;
    const dataset = buildIntradayFloatingPnlMap(metrics, [
      { ...basePosition, qty: 15, prevClose: 95 },
      { symbol: "OTHER", qty: 1, avgPrice: 20, last: 21, priceOk: true },
    ] as Position[]);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("TEST")).toBeCloseTo(65);
    expect(dataset.values.get("OTHER")).toBe(5);

    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const resolvedPrice = getResolvedPrice(position, 105);
    expect(resolvedPrice).toBe(105);
    expect(calculateIntradayValue(position, dataset)).toEqual({ status: "ok", value: 65 });

    const breakdown = buildIntradayBreakdownMap(metrics);
    expect(breakdown.hasLegsData).toBe(true);
    expect(breakdown.values.get("TEST")).toEqual({
      overnight: 50,
      intradayOpen: 15,
      realizedToday: 8,
      floating: 65,
      sumWithRealized: 73,
    });
  });

  it("银行家舍入确保四位精度", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "ROUND", qty: 10, basis: 100, mark: 105, amount: 1.23445, component: "mtm_overnight" },
        ],
      },
    } as any;
    const dataset = buildIntradayFloatingPnlMap(metrics, [
      { symbol: "ROUND", qty: 10, avgPrice: 100, last: 105, priceOk: true },
    ] as Position[]);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("ROUND")).toBe(1.2344);
  });

  it("翻向场景仅保留当日新开桶", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "FLIP", qty: 50, basis: 180, mark: 182, amount: -50, component: "mtm_intraday_open" },
        ],
      },
    } as any;
    const dataset = buildIntradayFloatingPnlMap(metrics, [
      { symbol: "FLIP", qty: -50, avgPrice: 181, last: 182, priceOk: true },
    ] as Position[]);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("FLIP")).toBe(-50);

    const shortPosition: Position = {
      ...basePosition,
      symbol: "FLIP",
      qty: -50,
      avgPrice: 181,
    };
    const result = calculateIntradayValue(shortPosition, dataset);
    expect(result).toEqual({ status: "ok", value: -50 });
  });

  it("仅过夜场景返回过夜桶贡献", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "HOLD", qty: 70, basis: 100, mark: 102, amount: 140, component: "mtm_overnight" },
        ],
      },
    } as any;

    const dataset = buildIntradayFloatingPnlMap(metrics, [
      { symbol: "HOLD", qty: -70, avgPrice: 100, last: 102, priceOk: true },
    ] as Position[]);
    expect(dataset.values.get("HOLD")).toBe(140);
  });

  it("reports missing symbol when legs omit the ticker", () => {
    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const dataset = buildIntradayFloatingPnlMap({ aux: { m6Legs: [] } } as any);
    expect(dataset.hasLegsData).toBe(true);
    const result = calculateIntradayValue(position, dataset);
    expect(result.status).toBe("missing");
    expect(result.reason).toBe("missing_symbol");
    expect(result.message).toContain("TEST");
  });

  it("reports missing legs when metrics lack breakdown", () => {
    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const dataset = buildIntradayFloatingPnlMap(null);
    expect(dataset.hasLegsData).toBe(false);
    const result = calculateIntradayValue(position, dataset);
    expect(result.status).toBe("missing");
    expect(result.reason).toBe("missing_legs");
    expect(result.message).toContain("M6 legs");
  });

  it("reports invalid symbol when position symbol is empty", () => {
    const position: Position = {
      ...basePosition,
      symbol: " ",
    };

    const dataset = buildIntradayFloatingPnlMap(undefined);
    const result = calculateIntradayValue(position, dataset);
    expect(result.status).toBe("missing");
    expect(result.reason).toBe("invalid_symbol");
    expect(result.message).toContain("持仓代码");
  });

  it("乘数仅在合成后乘一次并保持四位精度", () => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "OPT",
            qty: 1,
            basis: 10,
            mark: 10.0155,
            amount: 0.0155,
            component: "mtm_overnight",
            multiplier: 100,
          },
        ],
      },
    } as any;
    const breakdown = buildIntradayFloatingBreakdown(metrics, [
      {
        symbol: "OPT",
        qty: 1,
        avgPrice: 10,
        last: 10.0155,
        prevClose: 10,
        priceOk: true,
      } as Position,
    ]);

    const entry = breakdown.values.get("OPT");
    expect(entry?.multiplier).toBe(100);
    expect(entry?.overnight).toBeCloseTo(0.0155, 4);
    expect(entry?.intradayOpen).toBe(0);
    expect(entry?.floatingPerUnit).toBeCloseTo(0.0155, 4);
    expect(entry?.floating).toBeCloseTo(1.55, 4);

    const dataset = buildIntradayFloatingPnlMap(metrics, [
      { symbol: "OPT", qty: 1, avgPrice: 10, last: 10.0155, prevClose: 10, priceOk: true },
    ] as Position[]);
    expect(dataset.values.get("OPT")).toBeCloseTo(1.55, 4);
  });

  it("当日内先配对后仅保留未平余量并计算均价", () => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "PAIR",
            qty: 100,
            basis: 180,
            mark: 182,
            amount: 200,
            component: "mtm_overnight",
          },
          {
            symbol: "PAIR",
            qty: 15,
            basis: 181,
            mark: 182,
            amount: 15,
            component: "mtm_intraday_open",
          },
          {
            symbol: "PAIR",
            qty: 25,
            basis: 181,
            mark: 183,
            amount: 40,
            component: "realized_today",
          },
        ],
      },
    } as any;

    const position: Position = {
      symbol: "PAIR",
      qty: 115,
      avgPrice: 180.2,
      last: 182,
      prevClose: 180,
      priceOk: true,
    } as any;

    const breakdown = buildIntradayFloatingBreakdown(metrics, [position]);
    const entry = breakdown.values.get("PAIR");

    expect(entry?.qNow).toBe(115);
    expect(entry?.qOvernight).toBe(100);
    expect(entry?.avgTodayLong).toBeCloseTo(181, 4);
    expect(entry?.avgTodayShort).toBeUndefined();
    expect(entry?.floating).toBeCloseTo(215, 4);
    expect(entry?.floatingPerUnit).toBeCloseTo(215, 4);
    expect(entry?.realizedToday).toBeCloseTo(40, 4);

    const dataset = buildIntradayFloatingPnlMap(metrics, [position]);
    expect(dataset.values.get("PAIR")).toBe(215);
  });

  it("银行家舍入卡点遵循半入偶数", () => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "EVEN",
            qty: 1,
            basis: 10,
            mark: 10.00505,
            amount: 0.00505,
            component: "mtm_overnight",
          },
          {
            symbol: "EVEN100",
            qty: 1,
            basis: 10,
            mark: 10.01505,
            amount: 0.01505,
            component: "mtm_overnight",
            multiplier: 100,
          },
        ],
      },
    } as any;

    const positions: Position[] = [
      { symbol: "EVEN", qty: 1, avgPrice: 10, last: 10.00505, prevClose: 10, priceOk: true },
      { symbol: "EVEN100", qty: 1, avgPrice: 10, last: 10.01505, prevClose: 10, priceOk: true },
    ];

    const breakdown = buildIntradayFloatingBreakdown(metrics, positions);
    const even = breakdown.values.get("EVEN");
    const even100 = breakdown.values.get("EVEN100");

    expect(even?.floatingPerUnit).toBeCloseTo(0.005, 4);
    expect(even?.floating).toBeCloseTo(0.005, 4);
    expect(even100?.floatingPerUnit).toBeCloseTo(0.015, 4);
    expect(even100?.floating).toBeCloseTo(1.505, 4);

    const dataset = buildIntradayFloatingPnlMap(metrics, positions);
    expect(dataset.values.get("EVEN")).toBeCloseTo(0.005, 4);
    expect(dataset.values.get("EVEN100")).toBeCloseTo(1.505, 4);
  });

  it("净仓为0时浮动盈亏归零", () => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "FLAT",
            qty: 100,
            basis: 180,
            mark: 182,
            amount: 200,
            component: "mtm_overnight",
          },
          {
            symbol: "FLAT",
            qty: 100,
            basis: 181,
            mark: 181,
            amount: 30,
            component: "realized_today",
          },
        ],
      },
    } as any;

    const position: Position = {
      symbol: "FLAT",
      qty: 0,
      avgPrice: 181,
      last: 182,
      prevClose: 180,
      priceOk: true,
    } as Position;

    const breakdown = buildIntradayFloatingBreakdown(metrics, [position]);
    const entry = breakdown.values.get("FLAT");
    expect(entry?.floating).toBe(0);
    expect(entry?.overnight).toBe(0);
    expect(entry?.intradayOpen).toBe(0);
    expect(entry?.qNow).toBe(0);
    expect(entry?.qOvernight).toBe(0);

    const dataset = buildIntradayFloatingPnlMap(metrics, [position]);
    expect(dataset.values.get("FLAT")).toBe(0);
  });

  it("缺昨收时提示首日过夜为0", () => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "FIRST",
            qty: 15,
            basis: 181,
            mark: 182,
            amount: 15,
            component: "mtm_intraday_open",
          },
        ],
      },
    } as any;

    const position: Position = {
      symbol: "FIRST",
      qty: 15,
      avgPrice: 181,
      last: 182,
      priceOk: true,
    } as Position;

    const breakdown = buildIntradayFloatingBreakdown(metrics, [position]);
    const entry = breakdown.values.get("FIRST");
    expect(entry?.overnight).toBe(0);
    expect(entry?.missingPrevClose).toBe(true);
    expect(entry?.prevClose).toBeUndefined();
    expect(entry?.intradayOpen).toBeCloseTo(15, 4);
    expect(entry?.floating).toBeCloseTo(15, 4);

    const dataset = buildIntradayFloatingPnlMap(metrics, [position]);
    expect(dataset.values.get("FIRST")).toBeCloseTo(15, 4);
  });
});
