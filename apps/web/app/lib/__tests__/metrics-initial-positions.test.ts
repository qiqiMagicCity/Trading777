import { computeFifo, type InitialPosition } from "@/lib/fifo";
import { calcMetrics, calcTodayFifoPnL } from "@/lib/metrics";
import type { Trade, Position } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T13:00:00-05:00"),
  };
});

describe("FIFO calculations with initial positions", () => {
  it("separates historical and intraday trades", () => {
    const initialPositions: InitialPosition[] = [
      { symbol: "AAPL", qty: 50, avgPrice: 10 },
    ];

    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 15,
        quantity: 50,
        date: "2024-01-02T10:00:00-05:00",
        action: "sell",
      },
      {
        symbol: "AAPL",
        price: 11,
        quantity: 20,
        date: "2024-01-02T11:00:00-05:00",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 12,
        quantity: 20,
        date: "2024-01-02T12:00:00-05:00",
        action: "sell",
      },
    ];

    const enriched = computeFifo(trades, initialPositions);
    const positions: Position[] = [];

    const todayStr = "2024-01-02";

    expect(calcTodayFifoPnL(enriched, todayStr, initialPositions)).toBe(20);

    const metrics = calcMetrics(enriched, positions, [], initialPositions);
    expect(metrics.M4).toBe(250);
    expect(metrics.M5.fifo).toBe(20);
    expect(metrics.M10.win).toBe(2);
    expect(metrics.M10.loss).toBe(0);
    expect(metrics.M10.flat).toBe(0);
    expect(metrics.M10.rate).toBe(1);
  });
});
