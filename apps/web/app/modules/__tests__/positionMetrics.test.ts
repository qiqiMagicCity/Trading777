import { calculateIntradayValue, getResolvedPrice } from "../positionMetrics";
import type { Position } from "@/lib/services/dataService";

describe("position metrics helpers", () => {
  const basePosition: Position = {
    symbol: "TEST",
    qty: 10,
    avgPrice: 100,
    last: 100,
    priceOk: true,
  };

  it("uses previous close when available", () => {
    const position: Position = {
      ...basePosition,
      prevClose: 95,
    };

    const resolvedPrice = getResolvedPrice(position, 105);
    expect(resolvedPrice).toBe(105);
    expect(calculateIntradayValue(position, resolvedPrice)).toBe((105 - 95) * position.qty);
  });

  it("falls back to unrealized PnL when previous close is missing", () => {
    const position: Position = {
      ...basePosition,
      last: NaN,
    };

    const resolvedPrice = getResolvedPrice(position, 110);
    expect(resolvedPrice).toBe(110);
    expect(calculateIntradayValue(position, resolvedPrice)).toBe((110 - position.avgPrice) * position.qty);
  });

  it("falls back to average price when quote is invalid", () => {
    const position: Position = {
      ...basePosition,
      last: NaN,
      avgPrice: 123.45,
      prevClose: 120,
    };

    const resolvedPrice = getResolvedPrice(position, undefined);
    expect(resolvedPrice).toBe(123.45);
    expect(calculateIntradayValue(position, resolvedPrice)).toBeCloseTo((123.45 - 120) * position.qty);
  });
});
