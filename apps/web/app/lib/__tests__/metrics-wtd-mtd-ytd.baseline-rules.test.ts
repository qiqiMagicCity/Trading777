import { calcWtdMtdYtdFromSnapshots, STALE_BASELINE_BDAYS } from "../metrics";
import type { DailyResult } from "../types";

describe("WTD/MTD/YTD baseline freshness rules", () => {
  const commonBaselines: DailyResult[] = [
    { date: "2024-12-31", realized: 0, unrealized: 100 },
    { date: "2025-08-29", realized: 0, unrealized: 150 },
  ];

  const buildDataset = (baselineDate: string): DailyResult[] => [
    ...commonBaselines,
    { date: baselineDate, realized: 0, unrealized: 180 },
    { date: "2025-09-22", realized: 2, unrealized: 200 },
    { date: "2025-09-23", realized: 1, unrealized: 205 },
    { date: "2025-09-24", realized: -1, unrealized: 207 },
  ];

  it("only degenerates when the baseline distance exceeds the threshold", () => {
    const evalDay = "2025-09-24";
    const fresh = calcWtdMtdYtdFromSnapshots(buildDataset("2025-09-15"), evalDay);
    expect(fresh.degraded.wtd).toBe(false);
    expect(fresh.diagnostics.wtd.reason).toBeUndefined();
    expect(fresh.diagnostics.wtd.baselineMeta?.distanceBusinessDays).toBe(
      STALE_BASELINE_BDAYS,
    );

    const stale = calcWtdMtdYtdFromSnapshots(buildDataset("2025-09-11"), evalDay);
    expect(Number.isNaN(stale.wtd)).toBe(true);
    expect(stale.degraded.wtd).toBe(true);
    expect(stale.status.wtd).toBe("degraded");
    expect(stale.diagnostics.wtd.reason).toBe("DEGEN_STALE_BASELINE");
    expect(stale.diagnostics.wtd.baselineMeta).toEqual(
      expect.objectContaining({ baselineYmd: "2025-09-11" }),
    );
    expect(
      stale.diagnostics.wtd.baselineMeta?.distanceBusinessDays,
    ).toBeGreaterThan(STALE_BASELINE_BDAYS);
  });
});

describe("WTD/MTD/YTD evaluation-day handling", () => {
  it("keeps Friday snapshots when evaluated on a Sunday", () => {
    const daily: DailyResult[] = [
      { date: "2024-12-31", realized: 0, unrealized: 90 },
      { date: "2025-08-29", realized: 0, unrealized: 120 },
      { date: "2025-09-12", realized: 0, unrealized: 140 },
      { date: "2025-09-18", realized: 3, unrealized: 150 },
      { date: "2025-09-19", realized: -1, unrealized: 152 },
    ];
    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-21");
    expect(result.degraded.wtd).toBe(false);
    expect(result.status.wtd).toBe("ok");
    expect(result.diagnostics.wtd.reason).toBeUndefined();
    expect(result.diagnostics.wtd.baselineMeta?.baselineYmd).toBe("2025-09-12");
    expect(result.wtd).toBe(2 + (152 - 140));
  });
});
