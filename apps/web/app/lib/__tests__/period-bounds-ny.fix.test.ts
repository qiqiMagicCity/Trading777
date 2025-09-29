import { calcWtdMtdYtd } from "../metrics";
import { computePeriods } from "../metrics-periods";
import { sumPeriodCached } from "../period-sum-cache";
import { startOfMonthNY, startOfWeekNY, startOfYearNY } from "../time";
import type { DailyResult } from "../types";

describe("period boundaries normalized to NY noon", () => {
  test("timezone-aware eval day stays within WTD/MTD/YTD and caching matches", () => {
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
    const nonCached = calcWtdMtdYtd(drs, evalYmd);
    const cached = computePeriods(drs, evalYmd);

    expect(nonCached.wtd).toBe(30);
    expect(nonCached.mtd).toBe(30);
    expect(nonCached.ytd).toBe(30);

    expect(cached.M11).toBe(nonCached.wtd);
    expect(cached.M12).toBe(nonCached.mtd);
    expect(cached.M13).toBe(nonCached.ytd);

    const evalMiddayISO = `${evalYmd}T12:00:00`;
    const wStart = startOfWeekNY(evalMiddayISO).toISOString().slice(0, 10);
    const mStart = startOfMonthNY(evalMiddayISO).toISOString().slice(0, 10);
    const yStart = startOfYearNY(evalMiddayISO).toISOString().slice(0, 10);

    expect(sumPeriodCached(drs, wStart, evalYmd)).toBe(nonCached.wtd);
    expect(sumPeriodCached(drs, mStart, evalYmd)).toBe(nonCached.mtd);
    expect(sumPeriodCached(drs, yStart, evalYmd)).toBe(nonCached.ytd);
  });

  test("week window does not drift a day earlier", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-09-21T16:00:00-04:00",
        realized: 90,
        unrealized: 0,
        unrealizedDelta: 0,
      },
      {
        date: "2025-09-22T16:00:00-04:00",
        realized: 10,
        unrealized: 0,
        unrealizedDelta: 0,
      },
      {
        date: "2025-09-23T16:00:00-04:00",
        realized: 10,
        unrealized: 0,
        unrealizedDelta: 0,
      },
    ];
    const evalYmd = "2025-09-23";
    const nonCached = calcWtdMtdYtd(drs, evalYmd);
    const cached = computePeriods(drs, evalYmd);

    expect(nonCached.wtd).toBe(20);
    expect(cached.M11).toBe(nonCached.wtd);
  });

  test("exclusive upper bound skips next month", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-09-30T16:00:00-04:00",
        realized: 30,
        unrealized: 0,
        unrealizedDelta: 0,
      },
      {
        date: "2025-10-01T16:00:00-04:00",
        realized: 999,
        unrealized: 0,
        unrealizedDelta: 0,
      },
    ];
    const evalYmd = "2025-09-30";
    const nonCached = calcWtdMtdYtd(drs, evalYmd);
    const cached = computePeriods(drs, evalYmd);

    expect(nonCached.mtd).toBe(30);
    expect(nonCached.ytd).toBe(30);
    expect(cached.M12).toBe(nonCached.mtd);
    expect(cached.M13).toBe(nonCached.ytd);
  });

  test("date-only daily entries stay in evaluation windows", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-11-05",
        realized: 50,
        unrealized: 0,
        unrealizedDelta: 0,
      },
    ];
    const evalYmd = "2025-11-05";

    const computed = computePeriods(drs, evalYmd);
    expect(computed.M11).toBe(50);
    expect(computed.M12).toBe(50);
    expect(computed.M13).toBe(50);

    const evalMiddayISO = `${evalYmd}T12:00:00Z`;
    const wStart = startOfWeekNY(evalMiddayISO).toISOString().slice(0, 10);
    const mStart = startOfMonthNY(evalMiddayISO).toISOString().slice(0, 10);
    const yStart = startOfYearNY(evalMiddayISO).toISOString().slice(0, 10);

    expect(sumPeriodCached(drs, wStart, evalYmd)).toBe(50);
    expect(sumPeriodCached(drs, mStart, evalYmd)).toBe(50);
    expect(sumPeriodCached(drs, yStart, evalYmd)).toBe(50);
  });

  test("midnight ISO daily entries stay in evaluation windows", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-12-07T00:00:00Z",
        realized: 70,
        unrealized: 0,
        unrealizedDelta: 0,
      },
    ];
    const evalYmd = "2025-12-07";

    const computed = computePeriods(drs, evalYmd);
    expect(computed.M11).toBe(70);
    expect(computed.M12).toBe(70);
    expect(computed.M13).toBe(70);

    const evalMiddayISO = `${evalYmd}T12:00:00Z`;
    const wStart = startOfWeekNY(evalMiddayISO).toISOString().slice(0, 10);
    const mStart = startOfMonthNY(evalMiddayISO).toISOString().slice(0, 10);
    const yStart = startOfYearNY(evalMiddayISO).toISOString().slice(0, 10);

    expect(sumPeriodCached(drs, wStart, evalYmd)).toBe(70);
    expect(sumPeriodCached(drs, mStart, evalYmd)).toBe(70);
    expect(sumPeriodCached(drs, yStart, evalYmd)).toBe(70);
  });
});
