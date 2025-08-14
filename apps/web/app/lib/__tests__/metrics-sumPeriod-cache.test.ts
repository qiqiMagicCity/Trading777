import { sumPeriod } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

describe("sumPeriod cache rebuild", () => {
  it("rebuilds when the daily array is mutated", () => {
    const daily: DailyResult[] = [
      { date: "2024-01-01", realized: 1, unrealized: 0 },
      { date: "2024-01-02", realized: 2, unrealized: 0 },
    ];

    // warm up cache
    expect(sumPeriod(daily, "2024-01-01", "2024-01-02")).toBe(3);

    // mutate original array
    daily.push({ date: "2024-01-03", realized: 3, unrealized: 0 });

    // expect cache to rebuild and include new record
    expect(sumPeriod(daily, "2024-01-01", "2024-01-03")).toBe(6);
  });
});
