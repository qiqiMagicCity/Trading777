import fc from 'fast-check';
import { runAll } from '@/lib/runAll';
import { computeFifo } from '@/lib/fifo';
import { normalizeMetrics } from "@/app/lib/metrics";

describe.skip('property based invariants', () => {
  it('M6 matches, positions non-negative, M9 monotonic', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];

    const tradeArb = fc.record({
      date: fc.constantFrom(
        '2024-01-01T10:00:00Z',
        '2024-01-02T10:00:00Z',
        '2024-01-03T10:00:00Z',
      ),
      side: fc.constantFrom('BUY', 'SELL'),
      qty: fc.integer({ min: 1, max: 5 }),
      price: fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
      symbol: fc.constant('AAA'),
    });

    const tradesArb = fc
      .array(tradeArb, { maxLength: 10 })
      .map(ts => ts.sort((a, b) => a.date.localeCompare(b.date)))
      .filter(ts => {
        let qty = 0;
        for (const t of ts) {
          qty += t.side === 'BUY' ? t.qty : -t.qty;
          if (qty < 0) return false;
        }
        return true;
      });

    const dailyArb = fc.array(
      fc.record({
        date: fc.constantFrom(...dates),
        realized: fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        unrealized: fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
      }),
      { maxLength: dates.length }
    );

    const closePriceArb = fc
      .tuple(
        fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
      )
      .map(([a, b, c]) => ({
        AAA: {
          '2024-01-01': a,
          '2024-01-02': b,
          '2024-01-03': c,
        },
      }));

    fc.assert(
      fc.property(tradesArb, dailyArb, closePriceArb, (trades, dailyResults, closePrices) => {
        const sortedDaily = dailyResults.sort((a, b) => a.date.localeCompare(b.date));
        let cumulativeTrades: typeof trades = [];
        let lastM9 = 0;
        for (const date of dates) {
          cumulativeTrades = cumulativeTrades.concat(
            trades.filter(t => t.date.startsWith(date)),
          );
          const drPrefix = sortedDaily.filter(d => d.date <= date);
            const res: any = runAll(date, [], cumulativeTrades, closePrices, { dailyResults: drPrefix });
            const m = normalizeMetrics(res);
            expect(m.M6.total).toBeCloseTo(m.M4.total + m.M3 + m.M5.fifo, 10);

          const fifo = computeFifo(
            cumulativeTrades.map(t => ({
              symbol: t.symbol,
              price: t.price,
              quantity: t.qty,
              date: t.date,
              action: t.side.toLowerCase() as any,
            })),
            [],
          );
          const pos = new Map<string, number>();
          for (const t of fifo) pos.set(t.symbol, t.quantityAfter);
          for (const q of pos.values()) {
            expect(q).toBeGreaterThanOrEqual(0);
          }

          expect((res as any).M9).toBeGreaterThanOrEqual(lastM9);
          lastM9 = (res as any).M9;
        }
      }),
    );
  });
});

