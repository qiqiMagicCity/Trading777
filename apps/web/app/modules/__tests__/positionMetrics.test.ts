import {
  buildIntradayPnlMap,
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

  it("汇总部分平仓日的已实现与未实现贡献", () => {
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
    const dataset = buildIntradayPnlMap(metrics);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("TEST")).toBeCloseTo(73);
    expect(dataset.values.get("OTHER")).toBe(5);

    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const resolvedPrice = getResolvedPrice(position, 105);
    expect(resolvedPrice).toBe(105);
    expect(calculateIntradayValue(position, dataset)).toEqual({ status: "ok", value: 73 });
  });

  it("仅有浮盈变动的交易日仍能给出当日盈亏", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "TEST", qty: 10, basis: 100, mark: 105, amount: 50, component: "mtm_overnight" },
          { symbol: "test", qty: 5, basis: 102, mark: 105, amount: 15, component: "mtm_intraday_open" },
        ],
      },
    } as any;
    const dataset = buildIntradayPnlMap(metrics);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("TEST")).toBeCloseTo(65);

    const result = calculateIntradayValue(basePosition, dataset);
    expect(result).toEqual({ status: "ok", value: 65 });
  });

  it("纯已实现场景会直接读取 FIFO 结果", () => {
    const metrics = {
      aux: {
        m6Legs: [
          { symbol: "TEST", qty: 2, basis: 103, mark: 105, amount: 8, component: "realized_today" },
        ],
      },
    } as any;
    const dataset = buildIntradayPnlMap(metrics);
    expect(dataset.hasLegsData).toBe(true);
    expect(dataset.values.get("TEST")).toBe(8);

    const result = calculateIntradayValue(basePosition, dataset);
    expect(result).toEqual({ status: "ok", value: 8 });
  });

  it.each([
    ["空头回补盈利保留正号", 12.5],
    ["空头回补亏损保留负号", -9.8],
  ])("%s", (_, realizedAmount) => {
    const metrics = {
      aux: {
        m6Legs: [
          {
            symbol: "SHORTY",
            qty: 4,
            basis: 98,
            mark: 96,
            amount: -1.5,
            component: "mtm_intraday_open",
          },
          {
            symbol: "SHORTY",
            qty: 2,
            basis: 100,
            mark: 0,
            amount: realizedAmount,
            component: "realized_today",
          },
          {
            symbol: "SHORTY",
            qty: 4,
            basis: 96,
            mark: 95,
            amount: 4.4,
            component: "mtm_overnight",
          },
        ],
      },
    } as any;

    const dataset = buildIntradayPnlMap(metrics);
    const shortPosition: Position = {
      ...basePosition,
      symbol: "SHORTY",
      qty: -6,
      avgPrice: 101,
      last: 95,
    };

    const expected = realizedAmount + -1.5 + 4.4;
    expect(dataset.values.get("SHORTY")).toBeCloseTo(expected, 10);

    const result = calculateIntradayValue(shortPosition, dataset);
    expect(result).toEqual({ status: "ok", value: expected });
  });

  it("reports missing symbol when legs omit the ticker", () => {
    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const dataset = buildIntradayPnlMap({ aux: { m6Legs: [] } } as any);
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

    const dataset = buildIntradayPnlMap(null);
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

    const dataset = buildIntradayPnlMap(undefined);
    const result = calculateIntradayValue(position, dataset);
    expect(result.status).toBe("missing");
    expect(result.reason).toBe("invalid_symbol");
    expect(result.message).toContain("持仓代码");
  });
});
