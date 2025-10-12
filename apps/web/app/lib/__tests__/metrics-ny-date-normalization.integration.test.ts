import {
  calcMetricsInternal,
  calcWtdMtdYtdFromSnapshots,
  explainWtdMtdYtdFromSnapshots,
} from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

const d = (date: string, realized: number, unrealized: number): DailyResult => ({
  date,
  realized,
  unrealized,
});

describe("NY day normalization", () => {
  it("keeps late-night snapshots on the same New York date", () => {
    const daily: DailyResult[] = [
      d("2025-09-23T09:30:00-04:00", 10, 15),
      d("2025-09-23T23:30:00-04:00", 40, 30),
    ];

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-23");

    expect(explain.evalDay).toBe("2025-09-23");
    const target = explain.calendar.find((row) => row.day === "2025-09-23");
    expect(target).toMatchObject({ day: "2025-09-23", pnl: 40 });
  });

  it("retains correct WTD/MTD/YTD when the latest snapshot is late-night", () => {
    const daily: DailyResult[] = [
      d("2025-09-22T15:00:00-04:00", 100, 50),
      d("2025-09-23T23:30:00-04:00", 40, 30),
    ];

    const totals = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(totals.wtd).toBe(120);
    expect(totals.mtd).toBe(120);
    expect(totals.ytd).toBe(120);
    expect(totals.diagnostics.wtd.reason).toBeUndefined();

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    const dayRow = explain.calendar.find((row) => row.day === "2025-09-23");
    expect(dayRow?.pnl).toBe(40);

    const metrics = calcMetricsInternal([] as any, [] as any, daily, {
      tradingDateStr: "2025-09-23",
      periodEvalYmd: "2025-09-23",
    });

    expect(metrics.M11).toBe(120);
    expect(metrics.M12).toBe(120);
    expect(metrics.M13).toBe(120);
  });

  it("counts midnight ISO snapshots on the correct New York day", () => {
    const daily: DailyResult[] = [
      d("2025-09-23T23:00:00-04:00", 100, 0),
      d("2025-09-24T00:00:00Z", 50, 0),
    ];

    const totals = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");
    expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(totals.wtd).toBe(150);
    expect(totals.mtd).toBe(150);
    expect(totals.ytd).toBe(150);
    expect(totals.diagnostics.wtd.reason).toBeUndefined();

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-24");
    const target = explain.calendar.find((row) => row.day === "2025-09-24");
    expect(target?.pnl).toBe(50);
  });

  it("prefers the later snapshot when crossing midnight UTC", () => {
    const late: DailyResult = { date: "2024-03-11T00:05:00Z", realized: 80, unrealized: 0 };
    const early: DailyResult = { date: "2024-03-10T23:59:00Z", realized: 40, unrealized: 0 };
    const daily: DailyResult[] = [early, late];

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2024-03-10");
    const target = explain.calendar.find((row) => row.day === "2024-03-10");
    expect(target?.pnl).toBe(80);
  });

  it("handles spring DST transition without losing the latest snapshot", () => {
    const beforeShift: DailyResult = {
      date: "2024-03-10T01:59:00-05:00",
      realized: 120,
      unrealized: 0,
    };
    const afterShift: DailyResult = {
      date: "2024-03-10T03:05:00-04:00",
      realized: 240,
      unrealized: 0,
    };

    const explain = explainWtdMtdYtdFromSnapshots(
      [beforeShift, afterShift],
      "2024-03-10",
    );
    const target = explain.calendar.find((row) => row.day === "2024-03-10");
    expect(target?.pnl).toBe(240);
  });

  it("handles fall DST transition and keeps the actual final snapshot", () => {
    const beforeFallback: DailyResult = {
      date: "2024-11-03T01:59:00-04:00",
      realized: 310,
      unrealized: 0,
    };
    const afterFallback: DailyResult = {
      date: "2024-11-03T01:05:00-05:00",
      realized: 620,
      unrealized: 0,
    };

    const explain = explainWtdMtdYtdFromSnapshots(
      [beforeFallback, afterFallback],
      "2024-11-03",
    );
    const target = explain.calendar.find((row) => row.day === "2024-11-03");
    expect(target?.pnl).toBe(620);
  });

  it("uses updatedAt to resolve identical timestamps deterministically", () => {
    const baseDate = "2024-12-01T16:00:00-05:00";
    const olderUpdate = {
      date: baseDate,
      realized: 150,
      unrealized: 0,
      updatedAt: "2024-12-01T16:01:00-05:00",
    } as DailyResult & { updatedAt: string };
    const newerUpdate = {
      date: baseDate,
      realized: 450,
      unrealized: 0,
      updatedAt: "2024-12-01T16:05:00-05:00",
    } as DailyResult & { updatedAt: string };

    const explain = explainWtdMtdYtdFromSnapshots(
      [olderUpdate, newerUpdate],
      "2024-12-01",
    );
    const target = explain.calendar.find((row) => row.day === "2024-12-01");
    expect(target?.pnl).toBe(450);
  });

  it("prefers richer payload when timestamps and updates match", () => {
    const baseDate = "2024-12-02T16:00:00-05:00";
    const sparse = {
      date: baseDate,
      realized: 200,
      unrealized: 0,
    } as DailyResult;
    const rich = {
      date: baseDate,
      realized: 800,
      unrealized: 50,
      unrealizedDelta: 5,
    } as DailyResult;

    const explain = explainWtdMtdYtdFromSnapshots([sparse, rich], "2024-12-02");
    const target = explain.calendar.find((row) => row.day === "2024-12-02");
    expect(target?.pnl).toBe(805);
  });

  it("falls back to lexicographical order when all other tie-breakers match", () => {
    const baseDate = "2024-12-03T16:00:00-05:00";
    const alpha = {
      date: baseDate,
      realized: 100,
      unrealized: 0,
      note: "alpha",
    } as DailyResult & { note: string };
    const omega = {
      date: baseDate,
      realized: 900,
      unrealized: 0,
      note: "omega",
    } as DailyResult & { note: string };

    const explain = explainWtdMtdYtdFromSnapshots([alpha, omega], "2024-12-03");
    const target = explain.calendar.find((row) => row.day === "2024-12-03");
    expect(target?.pnl).toBe(900);
  });

  it("resolves previous trading day baseline for Monday windows", () => {
    const daily: DailyResult[] = [
      d("2025-09-26T16:00:00-04:00", 0, 40),
      d("2025-09-29T21:00:00Z", 10, 55),
    ];

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-29", {
      firstActiveDate: "2025-09-20",
    });

    expect(explain.baseline.week.baselineDate).toBe("2025-09-26");
    expect(explain.baselineMode.week).toBe("priced");
  });
});
