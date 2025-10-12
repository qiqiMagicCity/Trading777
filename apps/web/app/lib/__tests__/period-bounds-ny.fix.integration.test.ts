import { calcWtdMtdYtd, calcWtdMtdYtdFromSnapshots } from "../metrics";
import { computeDailyPeriodTotals, computePeriods } from "../metrics-periods";
import type { DailyResult } from "../types";

describe("period boundaries normalized to NY noon", () => {
  test("timezone-aware eval day stays within WTD/MTD/YTD", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-08-01T16:00:00-04:00",
        realized: 10,
        unrealized: 0,
        unrealizedDelta: 0,
      },
      {
        date: "2025-08-02T16:00:00-04:00",
        realized: 20,
        unrealized: 0,
        unrealizedDelta: 0,
      },
    ];
    const evalYmd = "2025-08-02";
    const direct = calcWtdMtdYtd(drs, evalYmd);
    const periods = computePeriods(drs, evalYmd);

    expect(direct).toEqual({ wtd: Number.NaN, mtd: Number.NaN, ytd: Number.NaN });
    expect(periods.M11).toBeCloseTo(30, 5);
    expect(periods.M12).toBeCloseTo(30, 5);
    expect(periods.M13).toBeCloseTo(30, 5);
  });

  test("week window does not drift a day earlier", () => {
    const drs: DailyResult[] = [
      { date: "2025-09-21T16:00:00-04:00", realized: 90, unrealized: 0, unrealizedDelta: 0 },
      { date: "2025-09-22T16:00:00-04:00", realized: 10, unrealized: 0, unrealizedDelta: 0 },
      { date: "2025-09-23T16:00:00-04:00", realized: 10, unrealized: 0, unrealizedDelta: 0 },
    ];
    const evalYmd = "2025-09-23";
    const direct = calcWtdMtdYtd(drs, evalYmd);
    const periods = computePeriods(drs, evalYmd);

    expect(direct.wtd).toBe(20);
    expect(periods.M11).toBe(20);
  });

  test("exclusive upper bound skips next month", () => {
    const drs: DailyResult[] = [
      { date: "2025-09-30T16:00:00-04:00", realized: 30, unrealized: 0, unrealizedDelta: 0 },
      { date: "2025-10-01T16:00:00-04:00", realized: 999, unrealized: 0, unrealizedDelta: 0 },
    ];
    const evalYmd = "2025-09-30";
    const direct = calcWtdMtdYtd(drs, evalYmd);
    const periods = computePeriods(drs, evalYmd);

    expect(Number.isNaN(direct.mtd)).toBe(true);
    expect(Number.isNaN(direct.ytd)).toBe(true);
    expect(periods.M12).toBe(30);
    expect(periods.M13).toBe(1029);
  });

  test("date-only daily entries stay in evaluation windows", () => {
    const drs: DailyResult[] = [
      { date: "2025-11-05", realized: 50, unrealized: 0, unrealizedDelta: 0 },
    ];
    const evalYmd = "2025-11-05";

    const periods = computePeriods(drs, evalYmd);
    expect(periods.M11).toBe(50);
    expect(periods.M12).toBe(50);
    expect(periods.M13).toBe(50);
  });

  test("calendar metadata reports expected boundaries", () => {
    const drs: DailyResult[] = [
      { date: "2025-01-01", realized: 5, unrealized: 10, unrealizedDelta: 10 },
      { date: "2025-01-02", realized: 2, unrealized: 11, unrealizedDelta: 1 },
    ];
    const evalYmd = "2025-01-02";
    const totals = computeDailyPeriodTotals(drs, evalYmd);

    expect(totals.weekStart).toBe("2025-01-01");
    expect(totals.monthStart).toBe("2025-01-01");
    expect(totals.yearStart).toBe("2025-01-01");
    expect(totals.evalDay).toBe(evalYmd);
  });

  test("calcWtdMtdYtdFromSnapshots and computePeriods stay in sync on NY day dedupe", () => {
    const drs: (DailyResult & { updatedAt?: string })[] = [
      { date: "2024-03-10T09:30:00-05:00", realized: 25, unrealized: 0 },
      { date: "2024-03-10T16:00:00-04:00", realized: 45, unrealized: 0 },
      { date: "2024-03-10T20:10:00-04:00", realized: 85, unrealized: 0, updatedAt: "2024-03-10T20:11:00-04:00" },
    ];
    const shuffled = [drs[2], drs[0], drs[1]];
    const evalYmd = "2024-03-10";

    const snapshotTotals = calcWtdMtdYtdFromSnapshots(shuffled, evalYmd);
    const periods = computePeriods(shuffled, evalYmd);
    const calendar = computeDailyPeriodTotals(shuffled, evalYmd);

    expect(snapshotTotals.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(Number.isNaN(snapshotTotals.wtd)).toBe(true);
    expect(Number.isNaN(snapshotTotals.mtd)).toBe(true);
    expect(Number.isNaN(snapshotTotals.ytd)).toBe(true);
    expect(periods.M11).toBe(85);
    expect(periods.M12).toBe(85);
    expect(periods.M13).toBe(85);
    expect(calendar.calendar.get(evalYmd)).toBe(85);
  });
});
