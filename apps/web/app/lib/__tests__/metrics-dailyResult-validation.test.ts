import { calcPeriodMetrics, type DailyResult } from "@/lib/metrics";

describe("calcPeriodMetrics validates DailyResult consistency", () => {
  it("throws and warns when components do not sum to pnl", () => {
    const invalid: DailyResult = {
      date: "2024-01-02",
      realized: 100,
      fifo: 10,
      float: 5,
      M5_1: 0,
      pnl: 999,
    };

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => calcPeriodMetrics([invalid], "2024-01-02")).toThrow(
      /DailyResult mismatch/,
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
