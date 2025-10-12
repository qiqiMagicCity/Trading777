import { sumPeriod } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

describe("sumPeriod simple aggregation", () => {
  it("sums realized plus delta over the requested window", () => {
    const daily: DailyResult[] = [
      { date: "2024-01-01", realized: 1, unrealized: 10, unrealizedDelta: 10 },
      { date: "2024-01-02", realized: 2, unrealized: 12, unrealizedDelta: 2 },
      { date: "2024-01-04", realized: 3, unrealized: 15, unrealizedDelta: 3 },
    ];

    expect(sumPeriod(daily, "2024-01-01", "2024-01-02")).toBe(15);
    expect(sumPeriod(daily, "2024-01-01", "2024-01-04")).toBe(21);
  });

  it("treats missing days as zero and handles invalid ranges", () => {
    const daily: DailyResult[] = [
      { date: "2024-01-05", realized: 5, unrealized: 50, unrealizedDelta: 5 },
    ];

    expect(sumPeriod(daily, "2024-01-01", "2024-01-10")).toBe(10);
    expect(sumPeriod(daily, "2024-01-10", "2024-01-01")).toBe(0);
  });
});
