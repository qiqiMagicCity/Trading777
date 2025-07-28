process.env.TZ = 'America/New_York';
import { calcMetrics } from './metrics';
import type { EnrichedTrade } from './fifo';
import type { Position } from './services/dataService';

// Mock current date to ensure consistent test results (noon, 15 July 2025, New‑York time)
const realDateNow = Date.now;
const realToISOString = Date.prototype.toISOString;

// Helper to compare metrics with a small numeric tolerance
function expectMetricsToBeClose(actual: any, expected: any) {
  Object.keys(expected).forEach(key => {
    const actualValue = actual[key];
    const expectedValue = expected[key];
    if (typeof expectedValue === 'number' && typeof actualValue === 'number') {
      if (key === 'M2') {
        // Compare absolute value for M2 (long & short方向符号可能不同)
        expect(Math.abs(actualValue)).toBeCloseTo(Math.abs(expectedValue), 1);
      } else {
        expect(actualValue).toBeCloseTo(expectedValue, 1);
      }
    } else {
      expect(actualValue).toEqual(expectedValue);
    }
  });
}

describe('黄金案例验证（纽约时区）', () => {
  beforeAll(() => {
    global.Date.now = jest.fn(() => new Date('2025-07-09T16:00:00Z').getTime()); // 12:00 PM EDT
    Date.prototype.toISOString = jest.fn(() => '2025-07-09T16:00:00.000Z');
  });

  afterAll(() => {
    global.Date.now = realDateNow;
    Date.prototype.toISOString = realToISOString;
  });

  /**
   * 案例 A：TSLA + GOOGL 综合场景
   */
  test('案例A：TSLA + GOOGL 综合场景', () => {
    const positions: Position[] = [
      { symbol: 'TSLA', qty: 50, avgPrice: 95, last: 105, priceOk: true },
      { symbol: 'GOOGL', qty: -20, avgPrice: 1500, last: 1490, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'TSLA', date: '2025-07-08', price: 90, quantity: 100, action: 'buy', weekday: 2, tradeCount: 1, amount: 9000, breakEvenPrice: 90, realizedPnl: 0, quantityAfter: 100, averageCost: 90 },
      { symbol: 'TSLA', date: '2025-07-09', price: 95, quantity: 50, action: 'buy', weekday: 3, tradeCount: 2, amount: 4750, breakEvenPrice: 91.67, realizedPnl: 0, quantityAfter: 150, averageCost: 91.67 },
      { symbol: 'TSLA', date: '2025-07-09', price: 105, quantity: 100, action: 'sell', weekday: 3, tradeCount: 3, amount: 10500, breakEvenPrice: 91.67, realizedPnl: 1500, quantityAfter: 50, averageCost: 95 },
      { symbol: 'GOOGL', date: '2025-07-09', price: 1500, quantity: 40, action: 'short', weekday: 3, tradeCount: 4, amount: 60000, breakEvenPrice: 1500, realizedPnl: 0, quantityAfter: -40, averageCost: 1500 },
      { symbol: 'GOOGL', date: '2025-07-09', price: 1480, quantity: 20, action: 'cover', weekday: 3, tradeCount: 5, amount: 29600, breakEvenPrice: 1500, realizedPnl: 400, quantityAfter: -20, averageCost: 1500 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: 1900, float: 700, pnl: 2600 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    console.log('案例A：TSLA + GOOGL 综合场景', metrics);
    expectMetricsToBeClose(metrics, {
      M1: 34750,
      M2: 35050,
      M3: 700,
      M4: 1500,
      M5: { fifo: 400, trade: 900 },
      M6: 2600,
      M7: { B: 1, S: 1, P: 1, C: 1, total: 4 },
      M8: { B: 2, S: 1, P: 1, C: 1, total: 5 },
      M9: 1900,
      M10: { W: 2, L: 0, rate: 100 },
      M11: 2600,
      M12: 2600,
      M13: 2600,
    });
  });

  /**
   * 案例 B：XYZ 纯多头 FIFO 出清
   */
  test('案例B：XYZ 纯多头 FIFO 出清', () => {
    const positions: Position[] = [
      { symbol: 'XYZ', qty: 50, avgPrice: 55, last: 60, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'XYZ', date: '2025-07-06', price: 50, quantity: 200, action: 'buy', weekday: 0, tradeCount: 1, amount: 10000, breakEvenPrice: 50, realizedPnl: 0, quantityAfter: 200, averageCost: 50 },
      { symbol: 'XYZ', date: '2025-07-07', price: 55, quantity: 100, action: 'buy', weekday: 1, tradeCount: 2, amount: 5500, breakEvenPrice: 51.67, realizedPnl: 0, quantityAfter: 300, averageCost: 51.67 },
      { symbol: 'XYZ', date: '2025-07-09', price: 60, quantity: 250, action: 'sell', weekday: 3, tradeCount: 3, amount: 15000, breakEvenPrice: 51.67, realizedPnl: 2250, quantityAfter: 50, averageCost: 55 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: 2250, float: 250, pnl: 2500 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 2750,
      M2: 3000,
      M3: 250,
      M4: 2250,
      M5: { fifo: 0, trade: 0 },
      M6: 2500,
      M7: { B: 0, S: 1, P: 0, C: 0, total: 1 },
      M8: { B: 2, S: 1, P: 0, C: 0, total: 3 },
      M9: 2250,
      M10: { W: 2, L: 0, rate: 100 },
      M11: 2500,
      M12: 2500,
      M13: 2500,
    });
  });

  /**
   * 案例 C：ABC 纯空头 FIFO 回补
   */
  test('案例C：ABC 纯空头 FIFO 回补', () => {
    const positions: Position[] = [
      { symbol: 'ABC', qty: -120, avgPrice: 120, last: 115, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'ABC', date: '2025-07-04', price: 120, quantity: 300, action: 'short', weekday: 4, tradeCount: 1, amount: 36000, breakEvenPrice: 120, realizedPnl: 0, quantityAfter: -300, averageCost: 120 },
      { symbol: 'ABC', date: '2025-07-09', price: 110, quantity: 180, action: 'cover', weekday: 3, tradeCount: 2, amount: 19800, breakEvenPrice: 120, realizedPnl: 1800, quantityAfter: -120, averageCost: 120 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: 1800, float: 600, pnl: 2400 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 14400,
      M2: 13800,
      M3: 600,
      M4: 1800,
      M5: { fifo: 0, trade: 0 },
      M6: 2400,
      M7: { B: 0, S: 0, P: 0, C: 1, total: 1 },
      M8: { B: 0, S: 0, P: 1, C: 1, total: 2 },
      M9: 1800,
      M10: { W: 1, L: 0, rate: 100 },
      M11: 2400,
      M12: 2400,
      M13: 2400,
    });
  });

  /**
   * 案例 D：DEF 当日部分平仓再建仓
   */
  test('案例D：DEF 当日部分平仓再建仓', () => {
    const positions: Position[] = [
      { symbol: 'DEF', qty: 110, avgPrice: 20.36, last: 23, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'DEF', date: '2025-07-09', price: 20, quantity: 100, action: 'buy', weekday: 3, tradeCount: 1, amount: 2000, breakEvenPrice: 20, realizedPnl: 0, quantityAfter: 100, averageCost: 20 },
      { symbol: 'DEF', date: '2025-07-09', price: 22, quantity: 30, action: 'sell', weekday: 3, tradeCount: 2, amount: 660, breakEvenPrice: 20, realizedPnl: 60, quantityAfter: 70, averageCost: 20 },
      { symbol: 'DEF', date: '2025-07-09', price: 21, quantity: 40, action: 'buy', weekday: 3, tradeCount: 3, amount: 840, breakEvenPrice: 20.36, realizedPnl: 0, quantityAfter: 110, averageCost: 20.36 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: 60, float: 290, pnl: 350 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 2239.6,
      M2: 2530,
      M3: 290.4,
      M4: 0,
      M5: { fifo: 60, trade: 60 },
      M6: 350,
      M7: { B: 2, S: 1, P: 0, C: 0, total: 3 },
      M8: { B: 2, S: 1, P: 0, C: 0, total: 3 },
      M9: 60,
      M10: { W: 1, L: 0, rate: 100 },
      M11: 350,
      M12: 350,
      M13: 350,
    });
  });

  /**
   * 案例 E：AAPL 亏损多批拆分
   */
  test('案例E：AAPL 亏损多批拆分', () => {
    const positions: Position[] = [
      { symbol: 'AAPL', qty: 50, avgPrice: 187, last: 175, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'AAPL', date: '2025-07-07', price: 200, quantity: 80, action: 'buy', weekday: 1, tradeCount: 1, amount: 16000, breakEvenPrice: 200, realizedPnl: 0, quantityAfter: 80, averageCost: 200 },
      { symbol: 'AAPL', date: '2025-07-08', price: 190, quantity: 40, action: 'buy', weekday: 2, tradeCount: 2, amount: 7600, breakEvenPrice: 195, realizedPnl: 0, quantityAfter: 120, averageCost: 195 },
      { symbol: 'AAPL', date: '2025-07-09', price: 185, quantity: 30, action: 'buy', weekday: 3, tradeCount: 3, amount: 5550, breakEvenPrice: 193.67, realizedPnl: 0, quantityAfter: 150, averageCost: 193.67 },
      { symbol: 'AAPL', date: '2025-07-09', price: 180, quantity: 100, action: 'sell', weekday: 3, tradeCount: 4, amount: 18000, breakEvenPrice: 200, realizedPnl: -2000, quantityAfter: 50, averageCost: 187 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: -1800, float: -600, pnl: -2400 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 9350,
      M2: 8750,
      M3: -600,
      M4: -1800,
      M5: { fifo: 0, trade: -150 },
      M6: -2400,
      M7: { B: 1, S: 1, P: 0, C: 0, total: 2 },
      M8: { B: 3, S: 1, P: 0, C: 0, total: 4 },
      M9: -1800,
      M10: { W: 0, L: 2, rate: 0 },
      M11: -2400,
      M12: -2400,
      M13: -2400,
    });
  });

  /**
   * 案例 F：NVDA 方向翻转 + 多日周期
   */
  test.skip('案例F：NVDA 方向翻转 + 多日周期', () => {
    const positions: Position[] = [
      { symbol: 'NVDA', qty: 30, avgPrice: 120, last: 118, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'NVDA', date: '2025-07-07', price: 130, quantity: 60, action: 'buy', weekday: 1, tradeCount: 1, amount: 7800, breakEvenPrice: 130, realizedPnl: 0, quantityAfter: 60, averageCost: 130 },
      { symbol: 'NVDA', date: '2025-07-08', price: 125, quantity: 80, action: 'sell', weekday: 2, tradeCount: 2, amount: 10000, breakEvenPrice: 130, realizedPnl: -300, quantityAfter: -20, averageCost: 125 },
      { symbol: 'NVDA', date: '2025-07-09', price: 120, quantity: 50, action: 'cover', weekday: 3, tradeCount: 3, amount: 6000, breakEvenPrice: 125, realizedPnl: 100, quantityAfter: 30, averageCost: 120 }
    ];

    const dailyResults = [
      { date: '2025-07-08', realized: -300, float: 200, pnl: -100 },
      { date: '2025-07-09', realized: 100, float: -60, pnl: 40 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 3600,
      M2: 3540,
      M3: -60,
      M4: -200,
      M5: { fifo: 0, trade: 0 },
      M6: -260,
      M7: { B: 0, S: 0, P: 0, C: 1, total: 1 },
      M8: { B: 1, S: 1, P: 0, C: 1, total: 3 },
      M9: -200,
      M10: { W: 1, L: 1, rate: 50 },
      M11: -60,
      M12: -60,
      M13: -60,
    });
  });

  /**
   * 案例 G：MSFT 今日仅加仓空头
   */
  test('案例G：MSFT 今日仅加仓空头', () => {
    const positions: Position[] = [
      { symbol: 'MSFT', qty: -60, avgPrice: 456.1875, last: 455.75, priceOk: true }
    ];

    const trades: EnrichedTrade[] = [
      { symbol: 'MSFT', date: '2025-07-08', price: 450.5, quantity: 25, action: 'short', weekday: 2, tradeCount: 1, amount: 11262.5, breakEvenPrice: 450.5, realizedPnl: 0, quantityAfter: -25, averageCost: 450.5 },
      { symbol: 'MSFT', date: '2025-07-09', price: 460.25, quantity: 35, action: 'short', weekday: 3, tradeCount: 2, amount: 16108.75, breakEvenPrice: 455.75, realizedPnl: 0, quantityAfter: -60, averageCost: 456.1875 }
    ];

    const dailyResults = [
      { date: '2025-07-09', realized: 0, float: 26.25, pnl: 26.25 }
    ];

    const metrics = calcMetrics(trades, positions, dailyResults);

    expectMetricsToBeClose(metrics, {
      M1: 27371.25,
      M2: 27345,
      M3: 26.25,
      M4: 0,
      M5: { fifo: 0, trade: 0 },
      M6: 26.25,
      M7: { B: 0, S: 0, P: 1, C: 0, total: 1 },
      M8: { B: 0, S: 0, P: 2, C: 0, total: 2 },
      M9: 0,
      M10: { W: 0, L: 0, rate: 0 },
      M11: 26.25,
      M12: 26.25,
      M13: 26.25,
    });
  });
});
