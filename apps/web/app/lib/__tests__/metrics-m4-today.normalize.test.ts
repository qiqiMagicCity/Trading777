import { normalizeMetrics } from "@/app/lib/metrics";

describe("normalizeMetrics M4_today", () => {
  it("combines realized, overnight, and intraday components", () => {
    const normalized = normalizeMetrics({
      M4: 120,
      _m6: {
        realizedToday: 150,
        mtmOvernight: 30,
        mtmIntradayOpen: -10,
        warnings: [],
      },
      aux: {
        realized: {
          today_total: 150,
          today_intraday: 20,
        },
      },
    });

    expect(normalized.M4_today).toMatchObject({
      total: 170,
      realized: 150,
      mtmOvernight: 30,
      mtmIntradayOpen: -10,
      degraded: false,
    });
  });

  it("marks M4_today as degraded when official prev close is missing", () => {
    const normalized = normalizeMetrics({
      M4: 0,
      _m6: {
        realizedToday: 0,
        mtmOvernight: 0,
        mtmIntradayOpen: 5,
        warnings: [],
      },
      aux: {
        realized: {
          today_total: 0,
          today_intraday: 5,
        },
        missingPrevCloseSymbols: ["AAPL"],
      },
      diagnostics: {
        missingOfficialCloses: [
          {
            symbol: "AAPL",
            date: "2024-01-02",
            purposes: ["M6"],
            impact: ["M6过夜桶=0"],
            hasFallback: true,
          },
        ],
      },
    });

    expect(normalized.M4_today.degraded).toBe(true);
    expect(normalized.M4_today.reason).toBe("missing_official_close_prev");
    expect(normalized.M4_today.total).toBe(5);
  });

  it("keeps M4_today at zero without degradation when no trades occurred", () => {
    const normalized = normalizeMetrics({
      M4: 0,
      _m6: {
        realizedToday: 0,
        mtmOvernight: 0,
        mtmIntradayOpen: 0,
        warnings: [],
      },
    });

    expect(normalized.M4_today).toMatchObject({
      total: 0,
      realized: 0,
      mtmOvernight: 0,
      mtmIntradayOpen: 0,
      degraded: false,
    });
  });
});
