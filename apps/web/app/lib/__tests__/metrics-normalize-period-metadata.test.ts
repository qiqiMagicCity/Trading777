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
        baseline: {
          firstActiveDate: "2025-09-22",
          wtd: {
            baselineDate: "2025-09-19",
            baselineMode: "zero",
            status: "ok_zero",
            realized: 12,
            unrealizedDelta: 0,
            missingSnapshot: false,
            missingSymbols: ["TSLA"],
          },
          mtd: {
            baselineDate: "2025-09-01",
            baselineMode: "priced",
            status: "ok",
            realized: 45,
            unrealizedDelta: 5,
            missingSnapshot: false,
            missingSymbols: [],
          },
          ytd: {
            baselineDate: "2025-01-02",
            baselineMode: "partial",
            status: "partial",
            realized: 120,
            unrealizedDelta: null,
            missingSnapshot: false,
            missingSymbols: ["AAPL", "MSFT"],
          },
        },
      },
    } as const;

    const result = normalizeMetrics({ ...input });

    expect("M11" in result).toBe(false);
    expect(result._period?.degraded).toEqual(input._period.degraded);
    expect(result._period?.summaries).toEqual(input._period.summaries);
    expect(result._period?.baseline).toEqual({
      firstActiveDate: "2025-09-22",
      wtd: {
        baselineDate: "2025-09-19",
        baselineMode: "zero",
        status: "ok_zero",
        realized: 12,
        unrealizedDelta: 0,
        missingSnapshot: false,
        missingSymbols: ["TSLA"],
      },
      mtd: {
        baselineDate: "2025-09-01",
        baselineMode: "priced",
        status: "ok",
        realized: 45,
        unrealizedDelta: 5,
        missingSnapshot: false,
        missingSymbols: [],
      },
      ytd: {
        baselineDate: "2025-01-02",
        baselineMode: "partial",
        status: "partial",
        realized: 120,
        unrealizedDelta: null,
        missingSnapshot: false,
        missingSymbols: ["AAPL", "MSFT"],
      },
    });
    expect(result._period).not.toBe(input._period);
    expect(result._period?.degraded).not.toBe(input._period.degraded);
  });
});
