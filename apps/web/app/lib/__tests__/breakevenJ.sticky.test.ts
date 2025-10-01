import { computeFifo } from "../fifo";
import type { Trade } from "../services/dataService";

describe("breakevenJ sticky self-check", () => {
  const makeTrade = (
    action: Trade["action"],
    symbol: string,
    price: number,
    quantity: number,
    date: string,
  ): Trade => ({ action, symbol, price, quantity, date });

  const expectIdentity = (trade: ReturnType<typeof computeFifo>[number]) => {
    const { breakEvenJ, accTotalCost, accRealizedPnl, netPosition } = trade;
    if (breakEvenJ !== undefined) {
      expect(accTotalCost - accRealizedPnl).toBeCloseTo(
        breakEvenJ * Math.abs(netPosition),
        10,
      );
      if (netPosition < 0) {
        expect(breakEvenJ).toBeLessThan(0);
      }
    }
  };

  it("Case A: 多头部分止盈", () => {
    const trades: Trade[] = [
      makeTrade("buy", "CASE-A", 10, 100, "2024-01-01"),
      makeTrade("sell", "CASE-A", 12, 50, "2024-01-02"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeCloseTo(8, 10);
    expect(latest.breakEvenJSticky).toBeCloseTo(8, 10);
    expect(latest.netPosition).toBe(50);
    expectIdentity(latest);
  });

  it("Case B: 空头部分回补", () => {
    const trades: Trade[] = [
      makeTrade("short", "CASE-B", 50, 100, "2024-02-01"),
      makeTrade("cover", "CASE-B", 45, 50, "2024-02-02"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeCloseTo(-55, 10);
    expect(latest.breakEvenJSticky).toBeCloseTo(-55, 10);
    expect(latest.netPosition).toBe(-50);
    expectIdentity(latest);
  });

  it("Case C: 多头穿越为空头", () => {
    const trades: Trade[] = [
      makeTrade("buy", "CASE-C", 10, 100, "2024-03-01"),
      makeTrade("sell", "CASE-C", 11, 120, "2024-03-02"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeCloseTo(-16, 10);
    expect(latest.breakEvenJSticky).toBeCloseTo(-16, 10);
    expect(latest.netPosition).toBe(-20);
    expectIdentity(latest);
  });

  it("Case D: 空头穿越成多头", () => {
    const trades: Trade[] = [
      makeTrade("short", "CASE-D", 50, 100, "2024-04-01"),
      makeTrade("cover", "CASE-D", 52, 100, "2024-04-02"),
      makeTrade("buy", "CASE-D", 52, 20, "2024-04-03"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeCloseTo(62, 10);
    expect(latest.breakEvenJSticky).toBeCloseTo(62, 10);
    expect(latest.netPosition).toBe(20);
    expectIdentity(latest);
  });

  it("Case E: 净仓归零时保留 sticky", () => {
    const trades: Trade[] = [
      makeTrade("buy", "CASE-E", 10, 100, "2024-05-01"),
      makeTrade("sell", "CASE-E", 12, 50, "2024-05-02"),
      makeTrade("sell", "CASE-E", 12, 50, "2024-05-03"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeUndefined();
    expect(latest.breakEvenJSticky).toBeCloseTo(8, 10);
    expect(latest.netPosition).toBe(0);
    expectIdentity(latest);
  });

  it("Case F: 再次开仓 sticky 覆盖为最新 J", () => {
    const trades: Trade[] = [
      makeTrade("buy", "CASE-F", 10, 100, "2024-06-01"),
      makeTrade("sell", "CASE-F", 12, 50, "2024-06-02"),
      makeTrade("sell", "CASE-F", 12, 50, "2024-06-03"),
      makeTrade("buy", "CASE-F", 13, 20, "2024-06-04"),
    ];
    const result = computeFifo(trades);
    const latest = result[result.length - 1]!;
    expect(latest.breakEvenJ).toBeCloseTo(13, 10);
    expect(latest.breakEvenJSticky).toBeCloseTo(13, 10);
    expect(latest.netPosition).toBe(20);
    expectIdentity(latest);
  });
});
