import { normalizeMetrics } from "@/app/lib/metrics";

describe("normalizeMetrics period metadata", () => {
  it("passes through degraded flags and retains additional metadata", () => {
    const input = {
      M11: Number.NaN,
      _period: {
        degraded: { wtd: true, mtd: false, ytd: true },
        summaries: [
          { window: "WTD", reason: "MISSING_BASELINE" },
          { window: "YTD", reason: "STALE_BASELINE" },
        ],
        status: { wtd: "partial", mtd: "ok", ytd: "missing" },
        breakdown: {
          wtd: {
            realized: 10,
            baselineMode: "partial",
            baselineDate: "2025-09-26",
          },
        },
      },
    } as const;

    const result = normalizeMetrics({ ...input });

    expect("M11" in result).toBe(false);
    expect(result._period?.degraded).toEqual(input._period.degraded);
    expect(result._period?.summaries).toEqual(input._period.summaries);
    expect(result._period?.status).toEqual(input._period.status);
    expect(result._period?.breakdown).toEqual(input._period.breakdown);
    expect(result._period).not.toBe(input._period);
    expect(result._period?.degraded).not.toBe(input._period.degraded);
    expect(result._period?.status).not.toBe(input._period.status);
    expect(result._period?.breakdown).not.toBe(input._period.breakdown);
  });
});
