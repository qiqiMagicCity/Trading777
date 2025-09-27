import { calcM6Detailed } from "../m6";

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
});
