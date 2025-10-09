import { jest } from '@jest/globals';

describe('syncPackagedClosesToIdb priority safeguards', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FREEZE_DATE = '2025-10-01';
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.NEXT_PUBLIC_FREEZE_DATE = undefined;
    process.env.FREEZE_DATE = undefined;
  });

  it('skips packaged seeds when higher-priority sources already exist', async () => {
    const sources = ['import', 'official/manual', 'official/vendor', 'official/exchange'];

    for (const source of sources) {
      jest.resetModules();
      const loadJsonMock = jest.fn().mockResolvedValue({
        AAPL: { '2025-09-19': 9 },
      });
      const getPriceMock = jest.fn().mockResolvedValue({
        symbol: 'AAPL',
        date: '2025-09-19',
        close: 12,
        source,
      });
      const putPriceMock = jest.fn();

      jest.unstable_mockModule('@/app/lib/dataSource', () =>
        ({
          loadJson: loadJsonMock,
        }) as unknown as Partial<typeof import('@/app/lib/dataSource')>,
      );
      jest.unstable_mockModule('@/lib/services/dataService', () =>
        ({
          getPrice: getPriceMock,
          putPrice: putPriceMock,
        }) as unknown as Partial<typeof import('@/lib/services/dataService')>,
      );

      const { syncPackagedClosesToIdb } = await import(
        '@/app/lib/prices/syncPackagedClosesToIdb'
      );

      const result = await syncPackagedClosesToIdb();
      expect(result.inserted).toBe(0);
      expect(result.skipped.higherPriority).toBe(1);
      expect(result.skipped.total).toBe(1);
      expect(result.skipped.same).toBe(0);
      expect(putPriceMock).not.toHaveBeenCalled();
    }
  });

  it('skips packaged seeds when the same packaged value already exists', async () => {
    jest.resetModules();
    const loadJsonMock = jest.fn().mockResolvedValue({
      MSFT: { '2025-10-03': 18 },
    });
    const getPriceMock = jest.fn().mockResolvedValue({
      symbol: 'MSFT',
      date: '2025-10-03',
      close: 18,
      source: 'official/packaged',
    });
    const putPriceMock = jest.fn();

    jest.unstable_mockModule('@/app/lib/dataSource', () =>
      ({
        loadJson: loadJsonMock,
      }) as unknown as Partial<typeof import('@/app/lib/dataSource')>,
    );
    jest.unstable_mockModule('@/lib/services/dataService', () =>
      ({
        getPrice: getPriceMock,
        putPrice: putPriceMock,
      }) as unknown as Partial<typeof import('@/lib/services/dataService')>,
    );

    const { syncPackagedClosesToIdb } = await import(
      '@/app/lib/prices/syncPackagedClosesToIdb'
    );

    const result = await syncPackagedClosesToIdb();
    expect(result.inserted).toBe(0);
    expect(result.skipped.same).toBe(1);
    expect(result.skipped.total).toBe(1);
    expect(result.skipped.higherPriority).toBe(0);
    expect(putPriceMock).not.toHaveBeenCalled();
  });
});
