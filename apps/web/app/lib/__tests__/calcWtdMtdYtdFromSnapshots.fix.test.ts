import { calcWtdMtdYtdFromSnapshots, explainWtdMtdYtdFromSnapshots } from "../metrics";
import { computePeriods } from "../metrics-periods";
import type { DailyResult } from "../types";

describe("calcWtdMtdYtdFromSnapshots simple aggregation", () => {
  const sampleDaily: DailyResult[] = [
    { date: "2025-09-22", realized: 5, unrealized: 100, unrealizedDelta: 10 },
    { date: "2025-09-23", realized: -2, unrealized: 105, unrealizedDelta: 5 },
    { date: "2025-09-24", realized: 4, unrealized: 110, unrealizedDelta: 5 },
    { date: "2025-09-25", realized: 3, unrealized: 112, unrealizedDelta: 2 },
  ];

  it("accumulates WTD/MTD/YTD by summing daily PnL", () => {
    const res = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25");
    // Daily PnL = realized + unrealizedDelta
    // 09-22: 15, 09-23: 3, 09-24: 9, 09-25: 5
    expect(res.wtd).toBe(32);
    expect(res.mtd).toBe(32);
    expect(res.ytd).toBe(32);
    expect(res.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
  });

  it("fills missing days with zero when computing sums", () => {
    const sparse: DailyResult[] = [
      { date: "2025-09-22", realized: 5, unrealized: 100, unrealizedDelta: 10 },
      { date: "2025-09-25", realized: 3, unrealized: 112, unrealizedDelta: 2 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(sparse, "2025-09-25");
    // 09-23 and 09-24 contribute 0
    expect(res.wtd).toBe(15 + 5); // 20
    expect(res.mtd).toBe(20);
    expect(res.ytd).toBe(20);
  });

  it("uses the last record of each day when duplicates exist", () => {
    const duplicate: DailyResult[] = [
      { date: "2025-09-24", realized: 1, unrealized: 100, unrealizedDelta: 1 },
      { date: "2025-09-24", realized: 2, unrealized: 101, unrealizedDelta: 1 },
      { date: "2025-09-24", realized: 3, unrealized: 104, unrealizedDelta: 3 },
      { date: "2025-09-25", realized: 4, unrealized: 105, unrealizedDelta: 1 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(duplicate, "2025-09-25");
    // latest 09-24 snapshot => realized 3 + delta 3 = 6
    expect(res.wtd).toBe(6 + 5);
  });

  it("treats the first trading week as Jan 1 to first Sunday", () => {
    const rows: DailyResult[] = [
      { date: "2025-01-01", realized: 2, unrealized: 10, unrealizedDelta: 10 },
      { date: "2025-01-02", realized: 1, unrealized: 11, unrealizedDelta: 1 },
      { date: "2025-01-05", realized: -1, unrealized: 9, unrealizedDelta: -2 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(rows, "2025-01-02");
    // WTD should include Jan 1 because week starts at Jan 1 for the first week
    expect(res.wtd).toBe(12 + 2);
    expect(res.mtd).toBe(res.wtd);
    expect(res.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
  });

  it("supports switching YTD mode to toDate", () => {
    const resFull = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25");
    const resToDate = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25", {
      ytdMode: "toDate",
    });
    expect(resFull.ytd).toBe(resToDate.ytd);
    const explain = explainWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25", {
      ytdMode: "toDate",
    });
    expect(explain.totals.ytd).toBe(resToDate.ytd);
  });

  it("matches computePeriods output for the same dataset", () => {
    const periods = computePeriods(sampleDaily, "2025-09-25");
    const snapshot = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25");
    expect(periods.M11).toBe(snapshot.wtd);
    expect(periods.M12).toBe(snapshot.mtd);
    expect(periods.M13).toBe(snapshot.ytd);
  });
});
