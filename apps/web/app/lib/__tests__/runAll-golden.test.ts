import fs from 'fs';
import path from 'path';
import runAll from '../runAll';

describe('runAll golden case', () => {
  const readJSON = (name: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../public', name), 'utf-8'),
    );

  it('matches expected metrics for golden dataset', () => {
    const trades = readJSON('trades.json');
    const positions = readJSON('initial_positions.json');
    const prices = readJSON('close_prices.json');
    const daily = readJSON('dailyResult.json');
    const date = '2025-08-01';

    const res = runAll(date, positions, trades, prices, { dailyResults: daily }, {
      evalDate: '2025-08-01',
    });

    expect(res.M1).toBeCloseTo(111170, 2);
    expect(res.M2).toBeCloseTo(111420.5, 2);
    expect(res.M3).toBeCloseTo(1102.5, 2);
    expect(res.M4.total).toBeCloseTo(6530, 2);
    expect(res.M5.behavior).toBeCloseTo(1670, 2);
    expect(res.M5.fifo).toBeCloseTo(1320, 2);
    expect(res.M6.total).toBeCloseTo(8952.5, 2);
    expect(res.M6.total).toBeCloseTo(res.M4.total + res.M3 + res.M5.fifo, 2);
    expect(res.M7).toEqual({ B: 6, S: 8, P: 4, C: 4, total: 22 });
    expect(res.M8).toEqual({ B: 8, S: 8, P: 5, C: 4, total: 25 });
    expect(res.M9).toBeCloseTo(7850, 2);
    expect(res.M10).toEqual({ W: 11, L: 2, winRatePct: 84.6 });
    expect(res.M11).toBeCloseTo(8952.5, 2);
    expect(res.M12).toBeCloseTo(8952.5, 2);
    expect(res.M13).toBeCloseTo(8952.5, 2);

    const nflxRows = res.aux.breakdown.filter(
      (r: any) => r.symbol === 'NFLX' && r.time.includes('09:40'),
    );
    const hasM4 = nflxRows.some((r: any) => r.into === 'M4' && r.qty === 100);
    const hasM52 = nflxRows.some((r: any) => r.into === 'M5.2' && r.qty === 20);
    expect(hasM4).toBe(true);
    expect(hasM52).toBe(true);
  });
});
