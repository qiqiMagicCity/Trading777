import { calcM1M2M3 } from "../calcM1M2M3";
import type { Position } from "@/app/lib/services/dataService";
import { fmtNY } from "@/app/lib/time";

describe("calcM1M2M3", () => {
  it("computes multiplier-aware exposure and PnL", () => {
    const optionUpdatedAt = Date.UTC(2024, 0, 2, 15, 0, 0);
    const stockUpdatedAt = Date.UTC(2024, 0, 2, 18, 30, 0);
    const positions: Position[] = [
      {
        symbol: "OPT-XYZ",
        qty: 2,
        avgPrice: 1,
        last: 1.5,
        priceOk: true,
        multiplier: 100,
        lastUpdatedAt: optionUpdatedAt,
      },
      {
        symbol: "AAA",
        qty: -3,
        avgPrice: 50,
        last: 45,
        priceOk: true,
        lastUpdatedAt: stockUpdatedAt,
      },
    ];

    const result = calcM1M2M3(positions);

    expect(result.m1).toBeCloseTo(350);
    expect(result.m2).toBeCloseTo(435);
    expect(result.m3.dir).toBeCloseTo(115);
    expect(result.m3.nominal).toBeCloseTo(115);
    expect(result.meta.priceStatus).toBe("live");
    expect(result.meta.lastPriceAtNY).toBe(fmtNY(stockUpdatedAt));
    expect(result.meta.staleSymbols).toBeUndefined();
  });

  it("flags stale symbols when prices are not fresh", () => {
    const positions: Position[] = [
      {
        symbol: "STALE",
        qty: 5,
        avgPrice: 10,
        last: 10,
        priceOk: false,
      },
    ];

    const result = calcM1M2M3(positions);
    expect(result.meta.priceStatus).toBe("stale");
    expect(result.meta.staleSymbols).toEqual(["STALE"]);
  });

  it("skips M2/M3 contribution when last price is missing", () => {
    const positions: Position[] = [
      {
        symbol: "MISS",
        qty: 4,
        avgPrice: 25,
        last: Number.NaN,
        priceOk: true,
      },
    ];

    const result = calcM1M2M3(positions);
    expect(result.m1).toBeCloseTo(100);
    expect(result.m2).toBeCloseTo(0);
    expect(result.m3.dir).toBeCloseTo(0);
    expect(result.m3.nominal).toBeCloseTo(0);
  });
});
