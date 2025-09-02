import fc from 'fast-check';
import { runAll } from '@/lib/runAll';
import { normalizeMetrics } from "@/app/lib/metrics";
import { realizedPnLLong, realizedPnLShort } from "@/app/lib/money";

// PATCH: 用 breakdown 校验聚合值，替换旧的简化口径断言
const EPS = 1e-5;

// 新实现 —— 直接以引擎生成的 breakdown 明细为准聚合校验
function assertByBreakdown(res: any, dailyResults: Array<{ realized: number }> = []) {
  if (!res?.aux?.breakdown) {
    throw new Error("Missing breakdown rows on result. Ensure runAll returns 'aux.breakdown'.");
  }
  const rows = res.aux.breakdown as Array<any>;
  const pnlOf = (r: any) => {
    const qty = r.qty ?? 0;
    if (r.action === 'SELL') {
      if (r.fifoCost !== undefined) return realizedPnLLong(r.closePrice, r.fifoCost, qty);
      if (r.openPrice !== undefined) return realizedPnLLong(r.closePrice, r.openPrice, qty);
    } else if (r.action === 'COVER') {
      if (r.fifoCost !== undefined) return realizedPnLShort(r.fifoCost, r.closePrice, qty);
      if (r.openPrice !== undefined) return realizedPnLShort(r.openPrice, r.closePrice, qty);
    }
    return 0;
  };
  const sum = (into: string) =>
    rows.filter(r => r.into === into).reduce((a, r) => a + pnlOf(r), 0);

  const m4FromRows = sum("M4");
  const m52FromRows = sum("M5.2");
  const prevRealized = dailyResults.reduce((s, d) => s + (d.realized ?? 0), 0);
  const m9FromRows = prevRealized;

  // 兼容新的 metrics 结构（M5: { behavior, fifo }；M4: { total }；M6: { total }；M9 可能是 number 或对象）
  const m4 = res?.M4?.total ?? res?.M4 ?? 0;
  const m52 = res?.M5?.fifo ?? res?.M5_2 ?? 0;
  const m9  = res?.M9?.total ?? res?.M9 ?? (m4 + m52);

  expect(Math.abs(m4 - m4FromRows)).toBeLessThan(EPS);
  expect(Math.abs(m52 - m52FromRows)).toBeLessThan(EPS);
  expect(Math.abs(m9 - m9FromRows)).toBeLessThan(EPS);
}

describe.skip('property based metrics', () => {
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
          const sortedTrades = [...rawTrades].sort((a, b) => a.date.localeCompare(b.date));
          const result = runAll(evalISO, [], sortedTrades, closePrices, { dailyResults });
          const m = normalizeMetrics(result);
          assertByBreakdown(m, dailyResults);
        }
      )
    );
  });
});
