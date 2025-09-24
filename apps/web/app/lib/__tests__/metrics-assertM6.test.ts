import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { calcM6Detailed } from "../m6";

describe("calcM6Detailed", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("matches formula for a single long position", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "AAA", qty: 10, priceNow: 110, prevClose: 100 },
      ],
      M4: 5,
      M5_FIFO: 2,
    });

    expect(result.mtm).toBe(100);
    expect(result.total).toBe(5 + 2 + 100);
    expect(result.legs).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles signed quantity for shorts", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "BBB", qty: -5, priceNow: 90, prevClose: 100 },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBe(50);
    expect(result.total).toBe(50);
  });

  it("ignores intraday round-trips when qty is zero", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "CCC", qty: 0, priceNow: 105, prevClose: 100 },
      ],
      M4: 12,
      M5_FIFO: -2,
    });

    expect(result.mtm).toBe(0);
    expect(result.total).toBe(10);
  });

  it("sums mixed long and short legs", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "DDD", qty: 4, priceNow: 12, prevClose: 10 },
        { symbol: "EEE", qty: -3, priceNow: 18, prevClose: 20 },
      ],
      M4: 1,
      M5_FIFO: 2,
    });

    const expectedMtm = (12 - 10) * 4 + (18 - 20) * -3;
    expect(result.mtm).toBe(expectedMtm);
    expect(result.total).toBe(1 + 2 + expectedMtm);
  });

  it("falls back to open price when prevClose is missing", () => {
    const fallbackOpen = jest.fn().mockReturnValue(50);
    const result = calcM6Detailed({
      positions: [
        { symbol: "FFF", qty: 2, priceNow: 55, prevClose: null },
      ],
      M4: 0,
      M5_FIFO: 0,
      fallbackOpen,
    });

    expect(fallbackOpen).toHaveBeenCalledWith("FFF");
    expect(console.warn).toHaveBeenCalledWith(
      "calcM6: prevClose missing, using fallback open for symbol",
      "FFF",
    );
    expect(result.mtm).toBe((55 - 50) * 2);
    expect(result.total).toBe((55 - 50) * 2);
  });

  it("skips symbols without marks and records warnings", () => {
    const result = calcM6Detailed({
      positions: [
        { symbol: "GGG", qty: 3, priceNow: null, prevClose: 10 },
      ],
      M4: 0,
      M5_FIFO: 0,
    });

    expect(result.mtm).toBe(0);
    expect(result.total).toBe(0);
    expect(result.warnings).toEqual([
      { symbol: "GGG", reason: "MISSING_MARK" },
    ]);
  });
});

