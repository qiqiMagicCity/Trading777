import { replayPortfolio, buildEnrichedTrades } from "../tradeReplay";
import type { Trade } from "@/lib/services/dataService";

describe("replayPortfolio break-even propagation", () => {
  it("populates break-even metrics on open positions", () => {
    const trades: Trade[] = [
      {
        symbol: "AAPL",
        action: "buy",
        price: 100,
        quantity: 10,
        date: "2024-01-02T00:00:00Z",
      },
      {
        symbol: "AAPL",
        action: "sell",
        price: 120,
        quantity: 4,
        date: "2024-01-03T00:00:00Z",
      },
      {
        symbol: "AAPL",
        action: "sell",
        price: 110,
        quantity: 2,
        date: "2024-01-04T00:00:00Z",
      },
    ];

    const replay = replayPortfolio(trades);
    const position = replay.positions.find((pos) => pos.symbol === "AAPL");
    expect(position).toBeDefined();
    if (!position) {
      return;
    }

    const enriched = buildEnrichedTrades(replay.baseline);
    const lastTrade = enriched.filter((t) => t.symbol === "AAPL").pop();
    expect(lastTrade).toBeDefined();
    if (!lastTrade) {
      return;
    }

    expect(position.breakEvenPrice).toBeCloseTo(lastTrade.breakEvenPrice ?? 0, 6);
    expect(position.breakEvenJ).toBeCloseTo(lastTrade.breakEvenJ ?? 0, 6);
    expect(position.breakEvenJSticky).toBeCloseTo(lastTrade.breakEvenJSticky ?? 0, 6);
    expect(position.breakEvenDirection).toBe(lastTrade.breakEvenDirection ?? null);
    expect(position.breakEvenDirectionSticky).toBe(
      lastTrade.breakEvenDirectionSticky ?? null,
    );
  });
});
