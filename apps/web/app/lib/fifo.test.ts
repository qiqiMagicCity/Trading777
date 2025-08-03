import { computeFifo, type InitialPosition } from './fifo';
import type { Trade } from './services/dataService';

describe('computeFifo', () => {
  it('processes trades without initial positions', () => {
    const trades: Trade[] = [
      { symbol: 'AAPL', price: 10, quantity: 100, date: '2024-01-01', action: 'buy' },
      { symbol: 'AAPL', price: 15, quantity: 50, date: '2024-01-02', action: 'sell' },
      { symbol: 'AAPL', price: 8, quantity: 50, date: '2024-01-03', action: 'sell' },
    ];
    const result = computeFifo(trades);
    expect(result.map(t => t.realizedPnl)).toEqual([0, 250, -100]);
    expect(result.map(t => t.quantityAfter)).toEqual([100, 50, 0]);
    expect(result.map(t => t.averageCost)).toEqual([10, 10, 0]);
  });

  it('processes trades with initial positions', () => {
    const trades: Trade[] = [
      { symbol: 'AAPL', price: 12, quantity: 100, date: '2024-01-02', action: 'sell' },
      { symbol: 'TSLA', price: 190, quantity: 50, date: '2024-01-02', action: 'cover' },
    ];
    const initial: InitialPosition[] = [
      { symbol: 'AAPL', qty: 100, avgPrice: 10 },
      { symbol: 'TSLA', qty: -50, avgPrice: 200 },
    ];
    const result = computeFifo(trades, initial);
    const aapl = result.find(t => t.symbol === 'AAPL')!;
    expect(aapl.realizedPnl).toBe(200);
    expect(aapl.quantityAfter).toBe(0);
    expect(aapl.averageCost).toBe(0);

    const tsla = result.find(t => t.symbol === 'TSLA')!;
    expect(tsla.realizedPnl).toBe(500);
    expect(tsla.quantityAfter).toBe(0);
    expect(tsla.averageCost).toBe(0);
  });

  it('handles partial closes and new positions from initial state', () => {
    const trades: Trade[] = [
      { symbol: 'AAPL', price: 12, quantity: 50, date: '2024-01-02', action: 'sell' },
      { symbol: 'AAPL', price: 8, quantity: 50, date: '2024-01-03', action: 'buy' },
    ];
    const initial: InitialPosition[] = [
      { symbol: 'AAPL', qty: 100, avgPrice: 10 },
    ];
    const result = computeFifo(trades, initial);
    expect(result.map(t => t.realizedPnl)).toEqual([100, 0]);
    expect(result.map(t => t.quantityAfter)).toEqual([50, 100]);
    const second = result[1]!;
    expect(second.averageCost).toBe(9);
    expect(second.breakEvenPrice).toBe(8);
  });
});
