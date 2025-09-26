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

  it("resets week and month boundaries correctly", () => {
    const daily: DailyResult[] = [
      { date: "2024-02-25", realized: 50, unrealizedDelta: 0 },
      { date: "2024-02-28", realized: 100, unrealizedDelta: 0 },
      { date: "2024-02-29", realized: 200, unrealizedDelta: 0 },
      { date: "2024-03-01", realized: 300, unrealizedDelta: 0 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2024-03-01");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 600, mtd: 300, ytd: 650 });
  });

  it("ignores prior-year results for YTD and WTD", () => {
    const daily: DailyResult[] = [
      { date: "2023-12-31", realized: 100, unrealizedDelta: 0 },
      { date: "2024-01-01", realized: 200, unrealizedDelta: 0 },
      { date: "2024-01-02", realized: 300, unrealizedDelta: 0 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2024-01-02");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 500, mtd: 500, ytd: 500 });
  });
});
