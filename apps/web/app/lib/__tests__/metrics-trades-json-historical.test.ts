import tradesData from './fixtures/trades-with-history.json';
import { computeFifo, type InitialPosition } from '@/lib/fifo';
import { calcMetrics } from '@/lib/metrics';
import type { Trade, Position } from '@/lib/services/dataService';

jest.mock('@/lib/timezone', () => {
  const actual = jest.requireActual('@/lib/timezone');
  return {
    ...actual,
    nowNY: () => new Date('2025-08-01T10:00:00-04:00'),
  };
});

describe('calcMetrics with trades.json historical lots', () => {
  it('matches expected M4, M5 and M10 values', () => {
    const initialPositions: InitialPosition[] = tradesData.positions.map(p => ({
      symbol: p.symbol,
      qty: p.qty,
      avgPrice: p.avgPrice,
    }));
    const trades: Trade[] = tradesData.trades.map((t, idx) => ({
      id: idx,
      symbol: t.symbol,
      price: t.price,
      quantity: t.qty,
      date: t.date,
      action: t.side.toLowerCase() as Trade['action'],
    }));
    const enriched = computeFifo(trades, initialPositions);
    const posMap = new Map<string, Position>(
      initialPositions.map(p => [p.symbol, { ...p, last: p.avgPrice, priceOk: true }])
    );
    for (const t of enriched) {
      if (t.quantityAfter !== 0) {
        posMap.set(t.symbol, {
          symbol: t.symbol,
          qty: t.quantityAfter,
          avgPrice: t.averageCost,
          last: t.averageCost,
          priceOk: true,
        });
      } else {
        posMap.delete(t.symbol);
      }
    }
    const positions: Position[] = Array.from(posMap.values());
    const metrics = calcMetrics(enriched, positions, [], initialPositions);
    expect(metrics.M4).toBe(6530);
    expect(metrics.M5.trade).toBe(1670);
    expect(metrics.M5.fifo).toBe(1320);
    expect(metrics.M7).toEqual({ B: 6, S: 8, P: 4, C: 4, total: 22 });
    expect(metrics.M8).toEqual({ B: 8, S: 8, P: 5, C: 4, total: 25 });
    expect(metrics.M9).toBe(0);
    expect(metrics.M10.W).toBe(11);
    expect(metrics.M10.L).toBe(2);
    expect(metrics.M10.rate).toBeCloseTo(84.61538, 5);
  });
});
