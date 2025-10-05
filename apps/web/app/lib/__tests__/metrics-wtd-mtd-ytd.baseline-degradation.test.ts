import {
  calcWtdMtdYtdFromSnapshots,
  STALE_BASELINE_BDAYS,
} from "../../lib/metrics";

type DailyInput = {
  date: string;
  realized: number;
  unrealized?: number;
  unrealizedDelta?: number;
  missingBaselineSymbols?: string[];
};

const row = (input: DailyInput): DailyInput => input;

describe("WTD/MTD/YTD 基线退化规则", () => {
  it("B1｜无基线 → 退化并返回 DEGEN_NO_BASELINE", () => {
    const daily = [
      row({ date: "2025-09-24T21:00:00Z", realized: 5, unrealized: 12 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    for (const key of ["wtd", "mtd", "ytd"] as const) {
      expect(result.degraded[key]).toBe(true);
      expect(result.status[key]).toBe("degraded");
      expect(result.degradation[key]?.reason).toBe("DEGEN_NO_BASELINE");
      expect(result.degradation[key]?.baselineMeta).toBeUndefined();
      expect(Number.isNaN(result[key])).toBe(true);
      expect(result.breakdown[key].baselineMode).toBe("missing");
    }
  });

  it("B2｜距离阈值以内的基线不退化", () => {
    const daily = [
      row({ date: "2025-08-29T21:00:00Z", realized: 0, unrealized: 90 }),
      row({ date: "2025-09-08T21:00:00Z", realized: 0, unrealized: 100 }),
      row({ date: "2025-09-15T21:00:00Z", realized: 6, unrealized: 120 }),
      row({ date: "2025-09-16T21:00:00Z", realized: -1, unrealized: 118 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-16");

    expect(result.degradation.wtd).toBeNull();
    expect(result.degraded.wtd).toBe(false);
    expect(result.status.wtd).not.toBe("degraded");
    expect(Number.isNaN(result.wtd)).toBe(false);
    expect(result.breakdown.wtd.baselineDate).toBe("2025-09-08");
  });

  it("B2｜超出阈值的基线退化并返回距离信息", () => {
    const daily = [
      row({ date: "2025-08-29T21:00:00Z", realized: 0, unrealized: 90 }),
      row({ date: "2025-09-05T21:00:00Z", realized: 0, unrealized: 95 }),
      row({ date: "2025-09-16T21:00:00Z", realized: 6, unrealized: 120 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-16");

    const wtdDegradation = result.degradation.wtd;
    expect(wtdDegradation?.reason).toBe("DEGEN_STALE_BASELINE");
    expect(wtdDegradation?.baselineMeta?.baselineYmd).toBe("2025-09-05");
    expect(wtdDegradation?.baselineMeta?.distanceBusinessDays).toBe(
      STALE_BASELINE_BDAYS + 1,
    );
    expect(Number.isNaN(result.wtd)).toBe(true);
    expect(result.status.wtd).toBe("degraded");
  });

  it("B3｜合规基线 + 多窗口 → 结果不再三项同值", () => {
    const daily = [
      row({ date: "2024-12-31T21:00:00Z", realized: 0, unrealized: 90 }),
      row({ date: "2025-01-02T21:00:00Z", realized: 40, unrealized: 105 }),
      row({ date: "2025-01-15T21:00:00Z", realized: -10, unrealized: 115 }),
      row({ date: "2025-01-31T21:00:00Z", realized: 5, unrealized: 120 }),
      row({ date: "2025-02-03T21:00:00Z", realized: 20, unrealized: 130 }),
      row({ date: "2025-02-07T21:00:00Z", realized: -3, unrealized: 140 }),
      row({ date: "2025-02-10T21:00:00Z", realized: 15, unrealized: 150 }),
      row({ date: "2025-02-11T21:00:00Z", realized: -5, unrealized: 155 }),
      row({ date: "2025-02-12T21:00:00Z", realized: 10, unrealized: 158 }),
      row({ date: "2025-02-13T21:00:00Z", realized: -8, unrealized: 160 }),
      row({ date: "2025-02-14T21:00:00Z", realized: 12, unrealized: 165 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-02-14");

    expect(result.degraded.wtd).toBe(false);
    expect(result.degraded.mtd).toBe(false);
    expect(result.degraded.ytd).toBe(false);
    expect(result.degradation.wtd).toBeNull();
    expect(result.degradation.mtd).toBeNull();
    expect(result.degradation.ytd).toBeNull();
    expect(Number.isNaN(result.wtd)).toBe(false);
    expect(Number.isNaN(result.mtd)).toBe(false);
    expect(Number.isNaN(result.ytd)).toBe(false);
    expect(result.wtd).not.toBeCloseTo(result.mtd);
    expect(result.mtd).not.toBeCloseTo(result.ytd);
  });

  it("同日多快照仅保留最后一条", () => {
    const daily = [
      row({ date: "2024-12-31T21:00:00Z", realized: 0, unrealized: 70 }),
      row({ date: "2025-02-28T21:00:00Z", realized: 0, unrealized: 90 }),
      row({ date: "2025-03-03T09:30:00Z", realized: 10, unrealized: 95 }),
      row({ date: "2025-03-05T09:30:00Z", realized: 1, unrealized: 100 }),
      row({ date: "2025-03-05T23:59:00Z", realized: 5, unrealized: 110 }),
      row({ date: "2025-03-06T21:00:00Z", realized: -2, unrealized: 108 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-03-06");

    expect(result.degradation.wtd).toBeNull();
    expect(result.breakdown.wtd.realized).toBe(13);
    expect(result.breakdown.wtd.baselineDate).toBe("2025-02-28");
  });

  it("评估日在周末时仍纳入周五快照", () => {
    const daily = [
      row({ date: "2024-12-31T21:00:00Z", realized: 0, unrealized: 70 }),
      row({ date: "2025-02-28T21:00:00Z", realized: 0, unrealized: 90 }),
      row({ date: "2025-03-03T21:00:00Z", realized: 12, unrealized: 100 }),
      row({ date: "2025-03-07T21:00:00Z", realized: 8, unrealized: 130 }),
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-03-09");

    expect(result.degradation.wtd).toBeNull();
    expect(result.breakdown.wtd.realized).toBe(20);
    expect(result.breakdown.wtd.baselineDate).toBe("2025-02-28");
    expect(result.degraded.wtd).toBe(false);
  });
});
