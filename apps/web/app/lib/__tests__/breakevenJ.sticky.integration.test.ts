import { computeFifo } from "../fifo";
import type { Trade } from "../services/dataService";

const EPS = 1e-6;

describe("breakEvenJ sticky behaviours", () => {
  it("covers long/short scenarios with sticky tracking", () => {
    const trades: Trade[] = [
      // A: 多头部分止盈 → J = 8
      { symbol: "LPA", price: 10, quantity: 100, date: "2024-01-01", action: "buy" },
      { symbol: "LPA", price: 12, quantity: 50, date: "2024-01-02", action: "sell" },
      // B: 空头部分回补 → J = -55
      { symbol: "SHP", price: 50, quantity: -100, date: "2024-01-03", action: "short" },
      { symbol: "SHP", price: 45, quantity: 50, date: "2024-01-04", action: "cover" },
      // C: 多 → 穿越为空 → J = -16
      { symbol: "CRS", price: 10, quantity: 50, date: "2024-01-05", action: "buy" },
      { symbol: "CRS", price: 13, quantity: 100, date: "2024-01-06", action: "sell" },
      // E: 净仓 = 0 → J undefined，sticky 保留上次 J
      { symbol: "CRS", price: 11, quantity: 50, date: "2024-01-07", action: "cover" },
      // F: 再次开仓 → sticky 覆盖为最新 J
      { symbol: "CRS", price: 20, quantity: 40, date: "2024-01-08", action: "buy" },
      // D: 空 → 穿越为多 → J = 62
      { symbol: "SRL", price: 78, quantity: -50, date: "2024-01-09", action: "short" },
      { symbol: "SRL", price: 70, quantity: 100, date: "2024-01-10", action: "cover" },
    ];

    const enriched = computeFifo(trades);

    const findTrade = (symbol: string, date: string) =>
      enriched.find((t) => t.symbol === symbol && t.date === date);

    const scenarioA = findTrade("LPA", "2024-01-02");
    expect(scenarioA?.breakEvenJ).toBeCloseTo(8, 6);
    expect(scenarioA?.breakEvenDirection).toBe('LONG');
    expect(scenarioA?.breakEvenJSticky).toBeCloseTo(8, 6);
    expect(scenarioA?.breakEvenDirectionSticky).toBe('LONG');
    expect(scenarioA?.netPosition).toBeCloseTo(50, 6);

    const scenarioB = findTrade("SHP", "2024-01-04");
    expect(scenarioB?.breakEvenJ).toBeCloseTo(55, 6);
    expect(scenarioB?.breakEvenDirection).toBe('SHORT');
    expect(scenarioB?.breakEvenJSticky).toBeCloseTo(55, 6);
    expect(scenarioB?.breakEvenDirectionSticky).toBe('SHORT');
    expect(scenarioB?.netPosition).toBeCloseTo(-50, 6);

    const scenarioC = findTrade("CRS", "2024-01-06");
    expect(scenarioC?.breakEvenJ).toBeCloseTo(16, 6);
    expect(scenarioC?.breakEvenDirection).toBe('SHORT');
    expect(scenarioC?.breakEvenJSticky).toBeCloseTo(16, 6);
    expect(scenarioC?.breakEvenDirectionSticky).toBe('SHORT');
    expect(scenarioC?.netPosition).toBeCloseTo(-50, 6);

    const scenarioE = findTrade("CRS", "2024-01-07");
    expect(scenarioE?.breakEvenJ).toBeUndefined();
    expect(scenarioE?.breakEvenJSticky).toBeCloseTo(16, 6);
    expect(scenarioE?.breakEvenDirectionSticky).toBe('SHORT');
    expect(Math.abs(scenarioE?.netPosition || 0)).toBeLessThan(EPS);

    const scenarioF = findTrade("CRS", "2024-01-08");
    expect(scenarioF?.breakEvenJ).toBeCloseTo(13.75, 6);
    expect(scenarioF?.breakEvenDirection).toBe('LONG');
    expect(scenarioF?.breakEvenJSticky).toBeCloseTo(13.75, 6);
    expect(scenarioF?.breakEvenDirectionSticky).toBe('LONG');
    expect(scenarioF?.netPosition).toBeCloseTo(40, 6);

    const scenarioD = findTrade("SRL", "2024-01-10");
    expect(scenarioD?.breakEvenJ).toBeCloseTo(62, 6);
    expect(scenarioD?.breakEvenDirection).toBe('LONG');
    expect(scenarioD?.breakEvenJSticky).toBeCloseTo(62, 6);
    expect(scenarioD?.breakEvenDirectionSticky).toBe('LONG');
    expect(scenarioD?.netPosition).toBeCloseTo(50, 6);

    // 恒等式：
    // 多头：accTotalCost - accRealizedPnl ≈ breakEvenJ * |netPosition|
    // 空头：-accTotalCost + accRealizedPnl ≈ breakEvenJ * |netPosition|
    for (const trade of enriched) {
      if (trade.breakEvenJ !== undefined) {
        const rhs = trade.breakEvenJ * Math.abs(trade.netPosition);
        if (trade.breakEvenDirection === 'SHORT') {
          const lhs = -trade.accTotalCost + trade.accRealizedPnl;
          expect(lhs).toBeCloseTo(rhs, 6);
        } else {
          const lhs = trade.accTotalCost - trade.accRealizedPnl;
          expect(lhs).toBeCloseTo(rhs, 6);
        }
      }
    }

    for (const trade of enriched) {
      if (trade.breakEvenDirection === 'SHORT') {
        expect(trade.breakEvenJ).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
