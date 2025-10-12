import { calcWtdMtdYtd } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

describe("calcWtdMtdYtd", () => {
  it("sums realized and end-of-window unrealized across days", () => {
    const daily: DailyResult[] = [
      { date: "2023-12-29", realized: 0, unrealized: 0 },
      { date: "2024-01-01", realized: 100, unrealized: 50, unrealizedDelta: 50 },
      { date: "2024-01-02", realized: 0, unrealized: -20, unrealizedDelta: -70 },
      { date: "2024-01-03", realized: 10, unrealized: 30, unrealizedDelta: 50 },
    ];
    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2024-01-03");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 140, mtd: 140, ytd: 140 });
  });

  it("handles timezone-aware daily result timestamps", () => {
    const daily: DailyResult[] = [
      { date: "2023-12-29", realized: 0, unrealized: 0 },
      {
        date: "2024-01-01T23:59:59-05:00",
        realized: 40,
        unrealized: 10,
        unrealizedDelta: 10,
      },
      {
        date: "2024-01-02T04:00:00+00:00",
        realized: 20,
        unrealized: 5,
        unrealizedDelta: -5,
      },
      {
        date: "2024-01-03T16:00:00-05:00",
        realized: 35,
        unrealized: 15,
        unrealizedDelta: 5,
      },
    ];

    const { wtd, mtd, ytd } = calcWtdMtdYtd(daily, "2024-01-03");

    expect({ wtd, mtd, ytd }).toEqual({ wtd: 90, mtd: 90, ytd: 90 });
  });
});
