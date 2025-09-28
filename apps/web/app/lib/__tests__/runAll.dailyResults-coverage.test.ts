import { runAll, __private__ } from "../runAll";
import type { RawTrade } from "../runAll";

describe("needsSyntheticDailyResults coverage heuristics", () => {
  const { needsSyntheticDailyResults } = __private__;

  it("flags baselines that are too far before the window start", () => {
    const evalISO = "2025-03-14";
    const stale = [
      { date: "2024-12-31", realized: 0, unrealized: -5000 },
      { date: "2025-03-14", realized: 10, unrealized: 1200 },
    ];

    expect(needsSyntheticDailyResults(stale, evalISO)).toBe(true);
  });

  it("requires the first in-window snapshot to be close to the boundary", () => {
    const evalISO = "2025-04-20";
    const rows = [
      { date: "2024-12-31", realized: 0, unrealized: 100 },
      { date: "2025-03-31", realized: 0, unrealized: 200 },
      { date: "2025-04-01", realized: 0, unrealized: 210 },
      { date: "2025-04-11", realized: 0, unrealized: 215 },
      { date: "2025-04-20", realized: 0, unrealized: 220 },
    ];

    expect(needsSyntheticDailyResults(rows, evalISO)).toBe(true);
  });

  it("accepts well covered daily results", () => {
    const evalISO = "2025-04-18";
    const okRows = [
      { date: "2024-12-31", realized: 0, unrealized: 100 },
      { date: "2025-01-02", realized: 0, unrealized: 105 },
      { date: "2025-03-31", realized: 0, unrealized: 200 },
      { date: "2025-04-01", realized: 0, unrealized: 210 },
      { date: "2025-04-11", realized: 0, unrealized: 215 },
      { date: "2025-04-14", realized: 0, unrealized: 215 },
      { date: "2025-04-18", realized: 0, unrealized: 220 },
    ];

    expect(needsSyntheticDailyResults(okRows, evalISO)).toBe(false);
  });
});

describe("runAll regenerates stale daily results for accurate M11/M12/M13", () => {
  const evalISO = "2025-03-14";
  const positions = [{ symbol: "AAPL", qty: 100, avgPrice: 100 }];
  const closePrices: Record<string, Record<string, number>> = {
    AAPL: {
      "2025-03-07": 100,
      "2025-03-10": 101,
      "2025-03-11": 102,
      "2025-03-12": 103,
      "2025-03-13": 104,
      "2025-03-14": 105,
    },
  };

  it("falls back to generated snapshots when stale baselines are detected", async () => {
    const baselineWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const baseline = await runAll(
      evalISO,
      positions as any,
      [] as RawTrade[],
      closePrices,
      { dailyResults: [] },
      { evalDate: evalISO },
    );
    baselineWarn.mockRestore();

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const staleDaily = [
        { date: "2024-12-31", realized: 0, unrealized: -5000 },
        { date: "2025-03-14", realized: 9999, unrealized: 1234 },
      ];

      const res = await runAll(
        evalISO,
        positions as any,
        [] as RawTrade[],
        closePrices,
        { dailyResults: staleDaily },
        { evalDate: evalISO },
      );

      expect(warnSpy).toHaveBeenCalledWith(
        `[runAll] regenerated dailyResults for ${evalISO} due to insufficient baseline coverage`,
      );
      expect(res.M11).toBeCloseTo(baseline.M11, 6);
      expect(res.M12).toBeCloseTo(baseline.M12, 6);
      expect(res.M13).toBeCloseTo(baseline.M13, 6);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
