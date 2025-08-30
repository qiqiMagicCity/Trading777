import fc from 'fast-check';
import runAll from '@/lib/runAll';
import { computeFifo } from '@/lib/fifo';
import { calcM5Split } from '@/lib/m5-intraday';

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
      price: fc.float({ min: 1, max: 100 }),
    });

    const dailyArb = fc.record({
      date: fc.constantFrom('2024-01-01', '2024-01-02', '2024-01-03'),
      realized: fc.float({ min: -1000, max: 1000 }),
      unrealized: fc.float({ min: -1000, max: 1000 }),
    });

    const closePriceArb = fc.tuple(
      fc.float({ min: 1, max: 100 }),
      fc.float({ min: 1, max: 100 }),
      fc.float({ min: 1, max: 100 }),
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
          const expectedM5_2 = round2(split.fifo);
          const expectedM9 = dailyResults.reduce((s, d) => s + (d.realized || 0), 0);

          expect(result.M4).toBeCloseTo(expectedM4, 10);
          expect(result.M5_2).toBeCloseTo(expectedM5_2, 10);
          expect(result.M9).toBeCloseTo(expectedM9, 10);
        }
      )
    );
  });
});
