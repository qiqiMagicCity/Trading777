import { calcWtdMtdYtdFromSnapshots, explainWtdMtdYtdFromSnapshots } from "../metrics";
import { computeDailyPeriodTotals, computePeriods } from "../metrics-periods";
import type { DailyResult, DailyResultInput } from "../types";

describe("calcWtdMtdYtdFromSnapshots simple aggregation", () => {
  const sampleDaily: DailyResult[] = [
    { date: "2024-12-31", realized: 0, unrealized: 10 },
    { date: "2025-08-29", realized: 0, unrealized: 40 },
    { date: "2025-09-19", realized: 0, unrealized: 50 },
    { date: "2025-09-22", realized: 5, unrealized: 60 },
    { date: "2025-09-23", realized: -2, unrealized: 75 },
    { date: "2025-09-24", realized: 4, unrealized: 105 },
    { date: "2025-09-25", realized: 3, unrealized: 130 },
  ];

  it("accumulates WTD/MTD/YTD by summing daily PnL", () => {
    const res = calcWtdMtdYtdFromSnapshots(sampleDaily, "2025-09-25");
    expect(res.wtd).toBe(90);
    expect(res.mtd).toBe(100);
    expect(res.ytd).toBe(130);
    expect(res.wtd).not.toBe(res.mtd);
    expect(res.mtd).not.toBe(res.ytd);
    expect(res.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
  });

  it("fills missing days with zero when computing sums", () => {
    const sparse: DailyResult[] = [
      { date: "2024-12-31", realized: 0, unrealized: 10 },
      { date: "2025-08-29", realized: 0, unrealized: 40 },
      { date: "2025-09-19", realized: 0, unrealized: 50 },
      { date: "2025-09-22", realized: 5, unrealized: 60 },
      { date: "2025-09-25", realized: 3, unrealized: 130 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(sparse, "2025-09-25");
    expect(res.wtd).toBe(88);
    expect(res.mtd).toBe(98);
    expect(res.ytd).toBe(128);
  });

  it("uses the last record of each day when duplicates exist", () => {
    const duplicate: DailyResult[] = [
      { date: "2024-12-31", realized: 0, unrealized: 10 },
      { date: "2025-08-29", realized: 0, unrealized: 40 },
      { date: "2025-09-19", realized: 0, unrealized: 50 },
      { date: "2025-09-24", realized: 1, unrealized: 90 },
      { date: "2025-09-24", realized: 2, unrealized: 95 },
      { date: "2025-09-24", realized: 3, unrealized: 105 },
      { date: "2025-09-25", realized: 4, unrealized: 130 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(duplicate, "2025-09-25");
    expect(res.wtd).toBe(3 + 4 + (130 - 50));
  });

  it("treats the first trading week as Jan 1 to first Sunday", () => {
    const rows: DailyResult[] = [
      { date: "2024-12-31", realized: 0, unrealized: 5 },
      { date: "2025-01-01", realized: 2, unrealized: 15 },
      { date: "2025-01-02", realized: 1, unrealized: 16 },
      { date: "2025-01-05", realized: -1, unrealized: 14 },
    ];
    const res = calcWtdMtdYtdFromSnapshots(rows, "2025-01-02");
    expect(res.wtd).toBe(3 + (16 - 5));
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

  it("produces identical totals for numeric strings", () => {
    const evalDay = "2025-09-25";
    const stringSnapshots: DailyResultInput[] = sampleDaily.map((row) => ({
      ...row,
      realized: row.realized.toString(),
      unrealized: row.unrealized.toString(),
    }));

    const numericTotals = calcWtdMtdYtdFromSnapshots(sampleDaily, evalDay);
    const stringTotals = calcWtdMtdYtdFromSnapshots(stringSnapshots, evalDay);

    expect(stringTotals.wtd).toBe(numericTotals.wtd);
    expect(stringTotals.mtd).toBe(numericTotals.mtd);
    expect(stringTotals.ytd).toBe(numericTotals.ytd);
    expect(stringTotals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(stringTotals.diagnostics.wtd.parseErrors).toBeUndefined();
  });

  it("accepts negative zero strings without degrading", () => {
    const dataset: DailyResultInput[] = [
      { date: "2025-09-22", realized: "5", unrealized: "95" },
      { date: "2025-09-23", realized: "-0", unrealized: "95" },
      { date: "2025-09-24", realized: "-0.00", unrealized: "95" },
    ];
    const res = calcWtdMtdYtdFromSnapshots(dataset, "2025-09-24");
    expect(res.diagnostics.wtd.parseErrors).toBeUndefined();
    expect(res.diagnostics.mtd.parseErrors).toBeUndefined();
    expect(res.diagnostics.ytd.parseErrors).toBeUndefined();
    expect(res.diagnostics.wtd.reason).not.toBe("DEGEN_PARSE_FAILED");
    expect(res.diagnostics.mtd.reason).not.toBe("DEGEN_PARSE_FAILED");
    expect(res.diagnostics.ytd.reason).not.toBe("DEGEN_PARSE_FAILED");
  });

  it("marks diagnostics when snapshot numbers cannot be parsed", () => {
    const dataset: DailyResultInput[] = [
      { date: "2025-09-23", realized: "10", unrealized: "100" },
      { date: "2025-09-24", realized: "1,200", unrealized: "105" },
    ];
    const res = calcWtdMtdYtdFromSnapshots(dataset, "2025-09-24");
    const periods = computePeriods(dataset, "2025-09-24");

    expect(Number.isNaN(res.wtd)).toBe(true);
    expect(res.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(res.diagnostics.wtd.reason).toBe("DEGEN_PARSE_FAILED");
    expect(res.diagnostics.wtd.parseErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "realized",
          code: "PARSE_NUM_FAILED",
          value: "1,200",
        }),
      ]),
    );
    expect(Number.isNaN(periods.M11)).toBe(true);
    expect(Number.isNaN(periods.M12)).toBe(true);
    expect(Number.isNaN(periods.M13)).toBe(true);
  });
});

describe("NY day snapshot dedupe stability", () => {
  const base: (DailyResult & { updatedAt?: string })[] = [
    {
      date: "2024-05-10T09:30:00-04:00",
      realized: 100,
      unrealized: 0,
      updatedAt: "2024-05-10T09:31:00-04:00",
    },
    {
      date: "2024-05-10T16:00:00-04:00",
      realized: 200,
      unrealized: 0,
      updatedAt: "2024-05-10T16:01:00-04:00",
    },
    {
      date: "2024-05-10T20:10:00-04:00",
      realized: 300,
      unrealized: 0,
      updatedAt: "2024-05-10T20:11:00-04:00",
    },
  ];

  function mulberry32(seed: number) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleWithSeed<T>(input: readonly T[], seed: number): T[] {
    const result = [...input];
    const random = mulberry32(seed);
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  for (let round = 0; round < 10; round += 1) {
    it(`prefers the latest NY-day snapshot without degrading #${round + 1}`, () => {
      const dataset = shuffleWithSeed(base, round + 1);
      const totals = calcWtdMtdYtdFromSnapshots(dataset, "2024-05-10");
      const periods = computePeriods(dataset, "2024-05-10");
      const calendar = computeDailyPeriodTotals(dataset, "2024-05-10");

      expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
      expect(totals.wtd).toBe(300);
      expect(totals.mtd).toBe(300);
      expect(totals.ytd).toBe(300);
      expect(periods.M11).toBe(300);
      expect(periods.M12).toBe(300);
      expect(periods.M13).toBe(300);
      expect(calendar.calendar.get("2024-05-10")).toBe(300);

      const duplicateCount = totals.diagnostics.wtd.sameDayDuplicates;
      if (typeof duplicateCount === "number") {
        expect(duplicateCount).toBeGreaterThan(0);
      }
      expect(totals.diagnostics.wtd.reason).toBeUndefined();
    });
  }

  it("keeps baseline duplicates without degrading the window", () => {
    const dataset: DailyResultInput[] = [
      {
        date: "2024-05-05T09:30:00-04:00",
        realized: 50,
        unrealized: 150,
        updatedAt: "2024-05-05T09:45:00-04:00",
      } as DailyResultInput,
      {
        date: "2024-05-05T21:00:00-04:00",
        realized: 55,
        unrealized: 155,
        updatedAt: "2024-05-05T21:10:00-04:00",
      } as DailyResultInput,
      { date: "2024-05-06T16:00:00-04:00", realized: 60, unrealized: 160 } as DailyResultInput,
      { date: "2024-05-07T16:00:00-04:00", realized: 70, unrealized: 170 } as DailyResultInput,
      { date: "2024-05-10T16:00:00-04:00", realized: 90, unrealized: 190 } as DailyResultInput,
    ];

    const totals = calcWtdMtdYtdFromSnapshots(dataset, "2024-05-10");

    expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(totals.diagnostics.wtd.reason).toBeUndefined();
    expect(totals.breakdown.wtd.baselineDate).toBe("2024-05-05");
    expect(totals.breakdown.wtd.baselineMode).toBe("priced");
    expect(totals.diagnostics.wtd.sameDayDuplicates).toBeGreaterThan(0);
  });

  it("breaks ties deterministically when timestamps are identical", () => {
    const sameInstant = "2024-05-10T16:00:00-04:00";
    const dataset: DailyResultInput[] = [
      {
        date: sameInstant,
        realized: 100,
        unrealized: 0,
        note: "base",
      } as DailyResultInput,
      {
        date: sameInstant,
        realized: 200,
        updatedAt: "2024-05-10T16:00:10-04:00",
        unrealized: 0,
        note: "later",
      } as DailyResultInput,
      {
        date: sameInstant,
        realized: 220,
        updatedAt: "2024-05-10T16:00:10-04:00",
        unrealized: 0,
        note: "info",
        extra: { depth: 1 },
      } as DailyResultInput,
      {
        date: sameInstant,
        realized: 240,
        updatedAt: "2024-05-10T16:00:10-04:00",
        unrealized: 0,
        note: "zzz",
        extra: { depth: 1 },
      } as DailyResultInput,
    ];

    const totals = calcWtdMtdYtdFromSnapshots(dataset, "2024-05-10");

    expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(totals.wtd).toBe(240);
    expect(totals.diagnostics.wtd.reason).toBeUndefined();
    expect(totals.diagnostics.wtd.sameDayDuplicates).toBeGreaterThanOrEqual(3);
  });

  it("ignores invalid duplicates while keeping valid snapshots", () => {
    const dataset: DailyResultInput[] = [
      {
        date: "2024-05-10T09:30:00-04:00",
        realized: "$99",
        unrealized: "100",
        updatedAt: "2024-05-10T09:31:00-04:00",
      } as DailyResultInput,
      {
        date: "2024-05-10T16:00:00-04:00",
        realized: "120",
        unrealized: "130",
        updatedAt: "2024-05-10T16:01:00-04:00",
      } as DailyResultInput,
    ];

    const totals = calcWtdMtdYtdFromSnapshots(dataset, "2024-05-10");

    expect(totals.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    expect(totals.wtd).toBe(120);
    expect(totals.diagnostics.wtd.reason).toBeUndefined();
    expect(totals.diagnostics.wtd.parseErrors).toBeUndefined();
    expect(totals.diagnostics.wtd.sameDayDuplicates).toBeGreaterThanOrEqual(1);
  });
});
