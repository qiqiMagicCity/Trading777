import { calcWtdMtdYtd } from "../metrics";
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

    expect(direct).toEqual({ wtd: 30, mtd: 30, ytd: 30 });
    expect(periods.M11).toBe(direct.wtd);
    expect(periods.M12).toBe(direct.mtd);
    expect(periods.M13).toBe(direct.ytd);
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

    expect(direct.mtd).toBe(30);
    expect(direct.ytd).toBe(1029);
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
});
