import type { Daily } from '../metrics-periods';

describe('sumPeriod/computePeriods timezone resilience', () => {
  const originalTZ = process.env.TZ;
  let sumPeriod: typeof import('../metrics-periods').sumPeriod;
  let computePeriods: typeof import('../metrics-periods').computePeriods;

  const evalYmd = '2024-05-10';
  const daily: Daily[] = [
    {
      date: evalYmd,
      realized: 100,
      unrealized: 200,
      unrealizedDelta: 50,
    },
  ];

  beforeAll(async () => {
    process.env.TZ = 'Asia/Shanghai';
    jest.resetModules();
    const mod = await import('../metrics-periods');
    sumPeriod = mod.sumPeriod;
    computePeriods = mod.computePeriods;
  });

  afterAll(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
    jest.resetModules();
  });

  it('includes eval day when using sumPeriod', () => {
    expect(sumPeriod(daily, evalYmd, evalYmd)).toBe(150);
  });

  it('includes eval day when using computePeriods', () => {
    const periods = computePeriods(daily, `${evalYmd}T18:30:00Z`);
    expect(periods.M11).toBe(150);
    expect(periods.M12).toBe(150);
    expect(periods.M13).toBe(150);
  });
});
