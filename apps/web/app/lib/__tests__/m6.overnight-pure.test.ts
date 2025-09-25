import { calcM6Detailed } from "../m6";

describe("calcM6Detailed pure scenarios", () => {
  it("A: 无当日成交，仅昨夜仓位", () => {
    const result = calcM6Detailed({
      positions: [{ symbol: "AAPL", qty: 100, prevClose: 100, priceNow: 110 }],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.total).toBeCloseTo(1000, 6);
    expect(result.mtm).toBeCloseTo(1000, 6);
  });

  it("B: 纯日内开平且全平", () => {
    const result = calcM6Detailed({
      positions: [],
      M4: 250,
      M5_FIFO: 0,
    });

    expect(result.total).toBeCloseTo(250, 6);
    expect(result.mtm).toBeCloseTo(0, 6);
  });

  it("C: 昨夜持有+今日再买未平", () => {
    const result = calcM6Detailed({
      positions: [{ symbol: "NVDA", qty: 10, prevClose: 900, priceNow: 910 }],
      M4: 0,
      M5_FIFO: 30,
    });

    expect(result.mtm).toBeCloseTo(100, 6);
    expect(result.total).toBeCloseTo(130, 6);
  });
});
