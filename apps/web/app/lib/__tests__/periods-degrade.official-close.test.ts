import { calcMetrics, normalizeMetrics } from '@/app/lib/metrics';
import type { Position } from '@/lib/services/dataService';
import type { DailyResult } from '@/app/lib/types';

describe('period degradation reacts to official close lifecycle', () => {
  const evalDate = '2024-01-03';
  const prevDate = '2024-01-02';
  let inWindow = true;

  beforeAll(() => {
    jest
      .spyOn(require('@/app/lib/marketHours'), 'evaluateCloseWindow')
      .mockImplementation((date: string) => ({
        date,
        isTradingDay: true,
        requireOfficialClose: true,
        graceMinutes: 0,
        windowEndTs: Date.now(),
        nowTs: Date.now(),
        inWindow,
      }));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const positions: Position[] = [
    {
      symbol: 'MISS',
      qty: 10,
      avgPrice: 100,
      last: 95,
      prevClose: 100,
      priceOk: true,
    } as Position,
  ];

  const dailyResults: DailyResult[] = [
    { date: '2024-01-01', realized: 0, unrealized: 0 },
    { date: prevDate, realized: 10, unrealized: 5 },
    { date: evalDate, realized: -5, unrealized: -3 },
  ];

  const run = (officialCloseMap: Record<string, Record<string, number>>) =>
    normalizeMetrics(
      calcMetrics([], positions as any, dailyResults, {
        tradingDateStr: evalDate,
        periodEvalYmd: evalDate,
        officialCloseMap,
      }),
    );

  it('keeps periods healthy while awaiting official closes within the grace window', () => {
    inWindow = true;
    const normalized = run({});
    expect(normalized._period?.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    const diag = normalized._period?.diagnostics?.wtd;
    expect(diag?.officialClose?.pending).toHaveLength(1);
    expect(diag?.officialClose?.missing ?? []).toHaveLength(0);
    expect(diag?.degradeReasons).toBeUndefined();
  });

  it('degrades WTD/MTD/YTD when the grace window elapses without an official close', () => {
    inWindow = false;
    const normalized = run({});
    expect(normalized._period?.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    const diag = normalized._period?.diagnostics?.wtd;
    expect(diag?.officialClose?.missing ?? []).toHaveLength(1);
    const firstGap = diag?.officialClose?.missing?.[0];
    expect(firstGap?.date).toBe(prevDate);
    expect(firstGap?.symbols[0]?.impact).toEqual(
      expect.arrayContaining(['M6过夜=0→影响M4', 'WTD/MTD/YTD端点浮盈可能失真']),
    );
    expect(diag?.degradeReasons?.[0]?.kind).toBe('missing_official_close');
    expect(diag?.degradeReasons?.[0]?.entries[0]?.date).toBe(prevDate);
  });

  it('clears degradation once the official close is provided', () => {
    inWindow = false;
    const normalized = run({ MISS: { [prevDate]: 100 } });
    expect(normalized._period?.degraded).toEqual({ wtd: false, mtd: false, ytd: false });
    const diag = normalized._period?.diagnostics?.wtd;
    expect(diag?.officialClose?.missing ?? []).toHaveLength(0);
    expect(diag?.officialClose?.pending ?? []).toHaveLength(0);
    expect(diag?.degradeReasons).toBeUndefined();
  });
});
