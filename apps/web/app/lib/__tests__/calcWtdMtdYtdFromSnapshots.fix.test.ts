import { calcWtdMtdYtdFromSnapshots, explainWtdMtdYtdFromSnapshots } from "../metrics";
import { computePeriods } from "../metrics-periods";
import type { DailyResult } from "../types";

describe("calcWtdMtdYtdFromSnapshots simple aggregation", () => {
  const sampleDaily: DailyResult[] = [
    { date: "2025-09-22", realized: 5, unrealized: 10, unrealizedDelta: 10 },
    { date: "2025-09-23", realized: -2, unrealized: 25, unrealizedDelta: 15 },
    { date: "2025-09-24", realized: 4, unrealized: 55, unrealizedDelta: 30 },
    { date: "2025-09-25", realized: 3, unrealized: 80, unrealizedDelta: 25 },
  ];

  it("accumulates WTD/MTD/YTD by summing daily PnL", () => {
    const res = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25");
    // Daily PnL = realized + unrealizedDelta
    // 09-22: 15, 09-23: 13, 09-24: 34, 09-25: 28
    expect(res.wtd).toBe(90);
    expect(res.mtd).toBe(90);
    expect(res.ytd).toBe(90);
    expect(res.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
  });

  it("fills missing days with zero when computing sums", () => {
    const sparse: DailyResult[] = [
      { date: "2025-09-22", realized: 5, unrealized: 10, unrealizedDelta: 10 },
      { date: "2025-09-25", realized: 3, unrealized: 80, unrealizedDelta: 25 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(sparse, "2025-09-25");
    // 09-23 and 09-24 contribute 0 realized,但 ΔU 由端点差额决定
    expect(res.wtd).toBe(88);
    expect(res.mtd).toBe(88);
    expect(res.ytd).toBe(88);
  });

  it("uses the last record of each day when duplicates exist", () => {
    const duplicate: DailyResult[] = [
      { date: "2025-09-24", realized: 1, unrealized: 40, unrealizedDelta: 10 },
      { date: "2025-09-24", realized: 2, unrealized: 45, unrealizedDelta: 15 },
      { date: "2025-09-24", realized: 3, unrealized: 55, unrealizedDelta: 30 },
      { date: "2025-09-25", realized: 4, unrealized: 80, unrealizedDelta: 25 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(duplicate, "2025-09-25");
    // latest 09-24 snapshot => realized 3、unrealized=55
    expect(res.wtd).toBe(3 + 4 + (80 - 0));
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
