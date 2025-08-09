import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import { toNY, startOfDayNY, endOfDayNY } from "@/lib/date";
import type { Trade, Position } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T12:00:00-05:00"),
  };
});

describe("historical PnL across UTC midnight", () => {
  it("counts profit when trades span UTC midnight but same NY day", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 100,
        date: "2024-01-02T15:00:00Z", // 10:00 NY
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 110,
        quantity: 100,
        date: "2024-01-03T01:00:00Z", // 20:00 NY same day
        action: "sell",
      },
    ];

    const dayStart = startOfDayNY("2024-01-02");
    const dayEnd = endOfDayNY("2024-01-02");
    for (const tr of trades) {
      const d = toNY(tr.date);
      expect(d >= dayStart && d <= dayEnd).toBe(true);
    }

    const enriched = computeFifo(trades);
    const positions: Position[] = [];
    const metrics = calcMetrics(enriched, positions);

    expect(metrics.M4).toBe(1000);
    expect(metrics.M5.fifo).toBe(0);
    expect(metrics.M5.trade).toBe(0);
  });
});
