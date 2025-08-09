import { computeFifo } from "@/lib/fifo";
import { calcMetrics } from "@/lib/metrics";
import type { Trade } from "@/lib/services/dataService";

jest.mock("@/lib/timezone", () => {
  const actual = jest.requireActual("@/lib/timezone");
  return {
    ...actual,
    nowNY: () => new Date("2024-01-02T10:00:00-05:00"),
  };
});

describe("calcMetrics M7 counts", () => {
  it("counts sell and cover per closed lot", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        price: 100,
        quantity: 100,
        date: "2024-01-02T10:00:00-05:00",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 110,
        quantity: 50,
        date: "2024-01-02T11:00:00-05:00",
        action: "buy",
      },
      {
        symbol: "AAPL",
        price: 120,
        quantity: 150,
        date: "2024-01-02T12:00:00-05:00",
        action: "sell",
      },
      {
        symbol: "MSFT",
        price: 200,
        quantity: 30,
        date: "2024-01-02T09:00:00-05:00",
        action: "short",
      },
      {
        symbol: "MSFT",
        price: 210,
        quantity: 20,
        date: "2024-01-02T09:30:00-05:00",
        action: "short",
      },
      {
        symbol: "MSFT",
        price: 190,
        quantity: 50,
        date: "2024-01-02T13:00:00-05:00",
        action: "cover",
      },
    ];

    const metrics = calcMetrics(computeFifo(trades), []);
    expect(metrics.M7).toEqual({ B: 2, S: 2, P: 2, C: 2, total: 8 });
    expect(metrics.M8).toEqual({ B: 2, S: 1, P: 2, C: 1, total: 6 });
  });

  it("oversell/overcover only register original action", () => {
    const trades: Trade[] = [
      {
        symbol: "TSLA",
        price: 100,
        quantity: 10,
        date: "2024-01-02T10:00:00-05:00",
        action: "buy",
      },
      {
        symbol: "TSLA",
        price: 90,
        quantity: 15,
        date: "2024-01-02T11:00:00-05:00",
        action: "sell",
      },
      {
        symbol: "TSLA",
        price: 95,
        quantity: 10,
        date: "2024-01-02T12:00:00-05:00",
        action: "cover",
      },
    ];

    const metrics = calcMetrics(computeFifo(trades), []);
    expect(metrics.M7).toEqual({ B: 1, S: 1, P: 0, C: 1, total: 3 });
    expect(metrics.M8).toEqual({ B: 1, S: 1, P: 0, C: 1, total: 3 });
  });

  it("counts sell/cover once even when split into multiple lots", () => {
    const trades: Trade[] = [
      {
        id: 1,
        symbol: "AAPL",
        price: 100,
        quantity: 100,
        date: "2024-01-02T10:00:00-05:00",
        action: "buy",
      },
      {
        id: 2,
        symbol: "AAPL",
        price: 110,
        quantity: 50,
        date: "2024-01-02T11:00:00-05:00",
        action: "buy",
      },
      {
        id: 3,
        symbol: "AAPL",
        price: 120,
        quantity: 150,
        date: "2024-01-02T12:00:00-05:00",
        action: "sell",
      },
      {
        id: 4,
        symbol: "MSFT",
        price: 200,
        quantity: 30,
        date: "2024-01-02T09:00:00-05:00",
        action: "short",
      },
      {
        id: 5,
        symbol: "MSFT",
        price: 210,
        quantity: 20,
        date: "2024-01-02T09:30:00-05:00",
        action: "short",
      },
      {
        id: 6,
        symbol: "MSFT",
        price: 190,
        quantity: 50,
        date: "2024-01-02T13:00:00-05:00",
        action: "cover",
      },
    ];

    const enriched = computeFifo(trades);
    const sell = enriched.find((t) => t.action === "sell")!;
    const cover = enriched.find((t) => t.action === "cover")!;

    const splitTrades = [
      enriched.find((t) => t.id === 1)!,
      enriched.find((t) => t.id === 2)!,
      { ...sell, quantity: 100 },
      { ...sell, quantity: 50 },
      enriched.find((t) => t.id === 4)!,
      enriched.find((t) => t.id === 5)!,
      { ...cover, quantity: 20 },
      { ...cover, quantity: 30 },
    ];

    const metrics = calcMetrics(splitTrades, []);
    expect(metrics.M7).toEqual({ B: 2, S: 2, P: 2, C: 2, total: 8 });
    expect(metrics.M8).toEqual({ B: 2, S: 1, P: 2, C: 1, total: 6 });
  });
});
