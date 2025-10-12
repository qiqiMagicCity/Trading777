import { normalizeMetrics } from "@/app/lib/metrics";

describe("normalizeMetrics count normalization", () => {
  it("coerces string counts and win rate percentages", () => {
    const metrics = normalizeMetrics({
      M1: "1",
      M2: "2",
      M3: "3",
      M4: { total: "4" },
      M5: { behavior: "5", fifo: "6" },
      M6: { total: "7" },
      M7: { B: "1", S: "2", P: "3", C: "4" },
      M8: { buy: "2", sell: "3", short: "4", cover: "5" },
      M9: "9",
      M10: { W: "6", L: "4", winRatePct: "60" },
    });

    expect(metrics.M7).toEqual({ B: 1, S: 2, P: 3, C: 4, total: 10 });
    expect(metrics.M8).toEqual({ B: 2, S: 3, P: 4, C: 5, total: 14 });
    expect(metrics.M9).toBe(9);
    expect(metrics.M10).toEqual({ win: 6, loss: 4, flat: 0, rate: 0.6 });
  });
});
