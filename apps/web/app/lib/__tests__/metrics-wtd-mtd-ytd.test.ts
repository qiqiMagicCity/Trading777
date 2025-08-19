import { calcWtdMtdYtd } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

describe("calcWtdMtdYtd", () => {
  it("sums realized and unrealized delta across days", () => {
    const daily: DailyResult[] = [
      { date: "2024-01-01", realized: 100, unrealized: 50, unrealizedDelta: 50 },
      { date: "2024-01-02", realized: 0, unrealized: -20, unrealizedDelta: -70 },
      { date: "2024-01-03", realized: 10, unrealized: 30, unrealizedDelta: 50 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2024-01-03");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 140, mtd: 140, ytd: 140 });
  });

  it("excludes previous year data when week spans two years", () => {
    const daily: DailyResult[] = [
      { date: "2024-12-30", realized: 10, unrealized: 0, unrealizedDelta: 0 },
      { date: "2024-12-31", realized: 20, unrealized: 0, unrealizedDelta: 0 },
      { date: "2025-01-01", realized: 30, unrealized: 0, unrealizedDelta: 0 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2025-01-01");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 30, mtd: 30, ytd: 30 });
  });
});
