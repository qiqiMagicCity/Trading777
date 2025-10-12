import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

describe("WTD/MTD/YTD: 缺少基线时直接退化", () => {
  it("returns degraded status and reason when only eval-day snapshot exists", () => {
    const daily = [
      { date: "2025-09-24", realized: 5, unrealized: 40 },
    ];
    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(Number.isNaN(result.wtd)).toBe(true);
    expect(Number.isNaN(result.mtd)).toBe(true);
    expect(Number.isNaN(result.ytd)).toBe(true);
    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.status).toEqual({ wtd: "degraded", mtd: "degraded", ytd: "degraded" });
    expect(result.diagnostics.wtd.reason).toBe("DEGEN_NO_BASELINE");
    expect(result.diagnostics.mtd.reason).toBe("DEGEN_NO_BASELINE");
    expect(result.diagnostics.ytd.reason).toBe("DEGEN_NO_BASELINE");
    expect(result.breakdown.wtd.baselineMode).toBe("missing");
    expect(result.diagnostics.wtd.baselineMeta).toBeUndefined();
  });
});
