import { adaptSummaryForUI } from "../metricsAdapters";

describe("adaptSummaryForUI", () => {
  it("should return backend M6 without recomputation", () => {
    const summary = {
      M4: 123.45,
      M5_2: 67.89,
      M6: 222.22,
      tradingDateStr: "2025-09-25",
    };

    const adapted = adaptSummaryForUI(summary);

    expect(adapted.todayTotalPnl).toBeCloseTo(222.22, 6);
    expect(adapted.todayRealized).toBeCloseTo(123.45, 6);
    expect(adapted.todayIntradayUnrealized).toBeCloseTo(67.89, 6);
    expect(adapted.tradingDateStr).toBe("2025-09-25");
  });

  it("should guard against missing values", () => {
    const adapted = adaptSummaryForUI({});
    expect(adapted.todayTotalPnl).toBe(0);
    expect(adapted.todayRealized).toBe(0);
    expect(adapted.todayIntradayUnrealized).toBe(0);
    expect(adapted.tradingDateStr).toBeUndefined();
  });
});
