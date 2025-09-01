import fc from 'fast-check';
import runAll from '@/lib/runAll';
import { computeFifo } from '@/lib/fifo';
import { calcM5Split } from '@/lib/m5-intraday';
import { normalizeMetrics } from "@/app/lib/metrics";

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('property based metrics', () => {
  it('M4/M5.2/M9 match simplified calculation', () => {
    const evalISO = '2024-01-03';
    const symbols = ['AAA', 'BBB', 'CCC'];

    const tradeArb = fc.record({
      date: fc.constantFrom(
        '2024-01-01T10:00:00Z',
        '2024-01-02T10:00:00Z',
        '2024-01-03T10:00:00Z',
      ),
      side: fc.constantFrom('BUY', 'SELL', 'SHORT', 'COVER'),
      symbol: fc.constantFrom(...symbols),
      qty: fc.integer({ min: 1, max: 5 }),
      price: fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
    });

    const dailyArb = fc.record({
      date: fc.constantFrom('2024-01-01', '2024-01-02', '2024-01-03'),
      realized: fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
      unrealized: fc.float({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    });

    const closePriceArb = fc.tuple(
      fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
    ).map(([a, b, c]) => ({
      AAA: { [evalISO]: a },
      BBB: { [evalISO]: b },
      CCC: { [evalISO]: c },
    }));

    fc.assert(
      fc.property(
        fc.array(tradeArb, { maxLength: 10 }),
        fc.array(dailyArb, { maxLength: 5 }),
        closePriceArb,
        (rawTrades, dailyResults, closePrices) => {
          const result = runAll(evalISO, [], rawTrades, closePrices, { dailyResults });
          const m = normalizeMetrics(result);

          const fifoTrades = rawTrades.map(t => ({
            symbol: t.symbol,
            price: t.price,
            quantity: t.qty,
            date: t.date,
            action: t.side.toLowerCase() as any,
          }));
          const enriched = computeFifo(fifoTrades, []);
          const split = calcM5Split(enriched as any, evalISO, []);

          const expectedM4 = round2(split.historyRealized);
          const expectedM5Fifo = round2(split.fifo);
          const expectedM9 = dailyResults.reduce((s, d) => s + d.realized, 0);

          expect(m.M4.total).toBeCloseTo(expectedM4, 10);
          expect(m.M5.fifo).toBeCloseTo(expectedM5Fifo, 10);
          expect(m.M9).toBeCloseTo(expectedM9, 10);
        }
      )
    );
  });
});
