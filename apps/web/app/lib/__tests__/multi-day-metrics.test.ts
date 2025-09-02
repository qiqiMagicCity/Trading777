import { runAll } from "../runAll";
import type { InitialPosition } from "../fifo";
import type { RawTrade } from "../runAll";
import type { DailyResult } from "../types";

/**
 * Ensure runAll correctly aggregates metrics across multiple days.
 */
describe("runAll multi-day metrics", () => {
  it("aggregates realized and period sums across days", async () => {
    const trades: RawTrade[] = [
      { date: "2023-12-29", side: "SELL", symbol: "AAA", qty: 100, price: 11 },
      { date: "2024-01-02", side: "BUY", symbol: "BBB", qty: 50, price: 20 },
      { date: "2024-01-03", side: "SELL", symbol: "BBB", qty: 50, price: 25 },
    ];
    const initialPositions: InitialPosition[] = [
      { symbol: "AAA", qty: 100, avgPrice: 10 },
    ];
    const dailyResults: DailyResult[] = [
      { date: "2023-12-29", realized: 100, unrealized: 10 },
      { date: "2024-01-02", realized: 0, unrealized: 50 },
      { date: "2024-01-03", realized: 250, unrealized: 0 },
    ];

    const res = await runAll(
      "2024-01-03",
      initialPositions,
      trades,
      {},
      { dailyResults },
      { evalDate: "2024-01-03" }
    );

    const totalRealized = dailyResults.reduce((s, d) => s + d.realized, 0);
    expect(res.M9).toBe(totalRealized);

    const periodExpected = dailyResults
      .filter((d) => d.date >= "2024-01-01")
      .reduce((s, d) => s + d.realized + d.unrealized, 0);
    expect(res.M11).toBe(periodExpected);
    expect(res.M12).toBe(periodExpected);
    expect(res.M13).toBe(periodExpected);
  });
});

