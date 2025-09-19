import fs from 'fs';
import path from 'path';
import { runAll } from '../apps/web/app/lib/runAll';
import { computePeriods } from '../apps/web/app/lib/metrics-periods';

describe('reliability multi-day baseline', () => {
  const readJSON = (name: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8'),
    );

  it('handles cross-day FIFO and period boundaries', async () => {
    const trades0731 = readJSON('2025-07-31.trades.json');
    const trades0801 = readJSON('2025-08-01.trades.json');
    const close = readJSON('closing-prices.json');
    const dailyResults = [
      { date: '2025-07-31', realized: 600, unrealized: 0 },
      { date: '2025-08-01', realized: 7850, unrealized: 1102.5 },
    ];
    const evalDate = new Date('2025-08-01T16:00:00-04:00');

    const res = await runAll(
      '2025-08-01',
      [],
      [...trades0731, ...trades0801],
      close,
      { dailyResults },
      { evalDate }
    );

    expect(res.M1).toBeCloseTo(111170, 2);
    expect(res.M2).toBeCloseTo(111420.5, 2);
    expect(res.M3).toBeCloseTo(1102.5, 2);
    expect(res.M4).toBeCloseTo(6530, 2);
    expect(res.M5_1).toBeCloseTo(1670, 2);
    expect(res.M5_2).toBeCloseTo(1320, 2);
    expect(res.M6).toBeCloseTo(8952.5, 2);
    expect(res.M7).toEqual({ B: 6, S: 8, P: 4, C: 4, total: 22 });
    expect(res.M8).toEqual({ B: 8, S: 8, P: 5, C: 4, total: 25 });
    expect(res.M7).not.toEqual(res.M8);
    expect(res.M9).toBe(8450);
    expect(res.M10).toEqual({ W: 11, L: 2, winRatePct: 84.6 });
    expect(res.M11).toBeCloseTo(9552.5, 2);
    expect(res.M12).toBeCloseTo(8952.5, 2);
    expect(res.M13).toBeCloseTo(9552.5, 2);

    const nflxRows = res.aux.breakdown.filter(
      (r: any) => r.symbol === 'NFLX' && r.time.includes('09:40'),
    );
    const hasM4 = nflxRows.some((r: any) => r.into === 'M4' && r.qty === 100);
    const hasM52 = nflxRows.some((r: any) => r.into === 'M5.2' && r.qty === 20);
    expect(hasM4).toBe(true);
    expect(hasM52).toBe(true);
  });

  it('ignores future-dated daily results for M9 while preserving other period windows', () => {
    const dailyResults = [
      { date: '2025-07-31', realized: 600, unrealized: 0 },
      { date: '2025-08-01', realized: 7850, unrealized: 1102.5 },
      { date: '2025-08-02', realized: 999, unrealized: 50 },
    ];
    const evalDate = new Date('2025-08-01T16:00:00-04:00');

    const { M9, M11, M12, M13 } = computePeriods(dailyResults, evalDate);

    expect(M9).toBe(8450);
    expect(M11).toBeCloseTo(9552.5, 5);
    expect(M12).toBeCloseTo(8952.5, 5);
    expect(M13).toBeCloseTo(9552.5, 5);
  });
});
