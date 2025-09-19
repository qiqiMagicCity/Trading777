import { describe, expect, it } from "@jest/globals";
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics } from "@/app/lib/metrics";

describe("runAll date-only trades", () => {
  it("counts trades recorded with date-only strings as today's activity", async () => {
    const evalISO = "2024-08-20";
    const trades = [
      { date: evalISO, side: "BUY" as const, symbol: "AAA", qty: 1, price: 10 },
      { date: evalISO, side: "SELL" as const, symbol: "AAA", qty: 1, price: 11 },
    ];

    const res = await runAll(
      evalISO,
      [],
      trades,
      {},
      { dailyResults: [] },
      { evalDate: evalISO },
    );

    const metrics = normalizeMetrics(res);

    expect(metrics.M5.behavior).toBeCloseTo(1, 6);
    expect(metrics.M5.fifo).toBeCloseTo(1, 6);
  });
});
