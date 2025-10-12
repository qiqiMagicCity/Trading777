import { jest } from '@jest/globals';

describe('syncPackagedClosesToIdb disabled by README rules', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FREEZE_DATE = '2025-10-01';
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env.NEXT_PUBLIC_FREEZE_DATE = undefined;
    process.env.FREEZE_DATE = undefined;
  });

  it('returns empty stats without touching packaged resources', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const loadJsonMock = jest.fn();
    const getPriceMock = jest.fn();
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
    expect(result).toEqual({
      total: 0,
      inserted: 0,
      skipped: { total: 0, higherPriority: 0, same: 0 },
    });
    expect(loadJsonMock).not.toHaveBeenCalled();
    expect(getPriceMock).not.toHaveBeenCalled();
    expect(putPriceMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
