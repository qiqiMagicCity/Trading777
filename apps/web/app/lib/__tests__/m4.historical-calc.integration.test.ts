import { calcM4Historical, type HistoricalLotInput, type TradeInput } from "../m4Historical";

function buildParams(
  lots: HistoricalLotInput[],
  trades: TradeInput[],
  evalDate = "2025-01-02",
) {
  return { evalDate, historicalLots: lots, trades };
}

describe("calcM4Historical", () => {
  test("计算单标的多头历史腿", () => {
    const lots: HistoricalLotInput[] = [
      { symbol: "TSLA", qty: 100, cost: 90, direction: "long", lotDate: "2025-01-01" },
    ];
    const trades: TradeInput[] = [
      { symbol: "TSLA", side: "SELL", qty: 60, price: 105, date: "2025-01-02T10:30:00-05:00" },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    expect(m4.realizedFromHistorical).toBeCloseTo((105 - 90) * 60, 6);
    expect(m4.legs).toHaveLength(1);
    const leg = m4.legs[0]!;
    expect(leg.symbol).toBe("TSLA");
    expect(leg.direction).toBe("long");
    expect(leg.matchedQty).toBeCloseTo(60, 6);
    expect(leg.sellOrCoverPrice).toBe(105);
    expect(leg.historicalCost).toBe(90);
    expect(leg.multiplier).toBe(1);
    expect(leg.pnl).toBeCloseTo((105 - 90) * 60, 6);
  });

  test("忽略同日开仓平仓数量，仅统计历史腿", () => {
    const lots: HistoricalLotInput[] = [
      { symbol: "AAPL", qty: 100, cost: 80, direction: "long", lotDate: "2024-12-31" },
    ];
    const trades: TradeInput[] = [
      { symbol: "AAPL", side: "BUY", qty: 50, price: 82, date: "2025-01-02T09:35:00-05:00" },
      { symbol: "AAPL", side: "SELL", qty: 120, price: 90, date: "2025-01-02T10:15:00-05:00" },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    expect(m4.legs.reduce((sum, leg) => sum + leg.matchedQty, 0)).toBeCloseTo(100, 6);
    expect(m4.realizedFromHistorical).toBeCloseTo((90 - 80) * 100, 6);
    expect(m4.legs.every((leg) => leg.direction === "long")).toBe(true);
  });

  test("支持空头回补", () => {
    const lots: HistoricalLotInput[] = [
      { symbol: "MSFT", qty: -80, cost: 120, direction: "short", lotDate: "2025-01-01" },
    ];
    const trades: TradeInput[] = [
      { symbol: "MSFT", side: "COVER", qty: 50, price: 100, date: "2025-01-02T13:00:00-05:00" },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    expect(m4.realizedFromHistorical).toBeCloseTo((120 - 100) * 50, 6);
    expect(m4.legs).toHaveLength(1);
    expect(m4.legs[0]?.direction).toBe("short");
  });

  test("应用合约乘数", () => {
    const lots: HistoricalLotInput[] = [
      {
        symbol: "TSLA240920C00100000",
        qty: 1,
        cost: 4,
        direction: "long",
        lotDate: "2025-01-01",
        multiplier: 100,
      },
    ];
    const trades: TradeInput[] = [
      {
        symbol: "TSLA240920C00100000",
        side: "SELL",
        qty: 1,
        price: 5,
        date: "2025-01-02T11:00:00-05:00",
      },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    expect(m4.realizedFromHistorical).toBeCloseTo((5 - 4) * 100, 6);
    expect(m4.legs[0]?.multiplier).toBe(100);
  });

  test("按历史匹配比例分摊费用", () => {
    const lots: HistoricalLotInput[] = [
      { symbol: "NVDA", qty: 30, cost: 400, direction: "long", lotDate: "2024-12-31" },
      { symbol: "NVDA", qty: 20, cost: 390, direction: "long", lotDate: "2024-12-30" },
    ];
    const trades: TradeInput[] = [
      {
        symbol: "NVDA",
        side: "SELL",
        qty: 70,
        price: 420,
        date: "2025-01-02T15:00:00-05:00",
        fees: { commission: 7, sec: 0.7 },
      },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    const totalHistoryQty = m4.legs.reduce((sum, leg) => sum + leg.matchedQty, 0);
    expect(totalHistoryQty).toBeCloseTo(50, 6);
    const commissionSum = m4.legs.reduce((sum, leg) => sum + leg.fees.commission, 0);
    const secSum = m4.legs.reduce((sum, leg) => sum + leg.fees.sec, 0);
    expect(commissionSum).toBeCloseTo(7 * (50 / 70), 6);
    expect(secSum).toBeCloseTo(0.7 * (50 / 70), 6);
  });

  test("忽略非评估日成交", () => {
    const lots: HistoricalLotInput[] = [
      { symbol: "BABA", qty: 10, cost: 70, direction: "long", lotDate: "2025-01-01" },
    ];
    const trades: TradeInput[] = [
      { symbol: "BABA", side: "SELL", qty: 10, price: 75, date: "2025-01-03T10:00:00-05:00" },
    ];

    const { m4 } = calcM4Historical(buildParams(lots, trades));

    expect(m4.realizedFromHistorical).toBe(0);
    expect(m4.legs).toHaveLength(0);
  });
});

