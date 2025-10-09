/**
 * 回归测试：官方收盘价一致性修复
 */
import 'fake-indexeddb/auto';

import { jest } from '@jest/globals';

type CloseJson = Record<string, Record<string, number>>;
type StoredOfficialClose = {
  symbol: string;
  date: string;
  close: number;
  source: string;
};
type OverlayEntry = {
  symbol: string;
  date: string;
  price: number;
  tsCreated: number;
  tsUpdated: number;
  source: string;
};
type DebugDetail = Record<
  string,
  Record<string, { price?: number; source?: string; fromLayer?: string }>
>;
type LoadJson = typeof import('@/app/lib/dataSource')['loadJson'];
type GetAllPrices = typeof import('@/app/lib/services/dataService')['getAllPrices'];
type ReadOverlay = typeof import('@/app/lib/officialCloseOverlayStore')['readOfficialCloseOverlay'];

async function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const factory = indexedDB as typeof indexedDB & {
    deleteDatabase?: typeof indexedDB.deleteDatabase;
  };
  if (typeof factory.deleteDatabase !== 'function') return;
  await new Promise<void>((resolve) => {
    const request = factory.deleteDatabase!(name);
    request.onblocked = () => resolve();
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
  });
}

async function clearIndexedDb(): Promise<void> {
  await deleteDatabase('TradingApp');
  await deleteDatabase('TradingOfficialCloseOverlay');
}

describe('official close consistency fixes', () => {
  const originalWindow: typeof window | undefined = global.window;

  beforeEach(() => {
    process.env.OFFICIAL_CLOSE_FIX_ENABLED = 'true';
    process.env.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED = 'true';
    if (typeof window !== 'undefined') {
      const win = window as typeof window & {
        OFFICIAL_CLOSE_FIX_ENABLED?: string;
        NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED?: string;
      };
      win.OFFICIAL_CLOSE_FIX_ENABLED = 'true';
      win.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED = 'true';
    }
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.resetModules();
    try {
      localStorage.clear();
    } catch {
      // ignore jsdom localStorage cleanup issues
    }
    delete (global as any).fetch;
    process.env.NEXT_PUBLIC_BASE_PATH = undefined;
    process.env.NEXT_PUBLIC_ASSET_PREFIX = undefined;
    process.env.NEXT_PUBLIC_WRITEBACK_MODE = undefined;
    process.env.WRITEBACK_MODE = undefined;
    process.env.NEXT_PUBLIC_FREEZE_DATE = undefined;
    process.env.FREEZE_DATE = undefined;
    process.env.OFFICIAL_CLOSE_FIX_ENABLED = undefined;
    process.env.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED = undefined;
    (global as typeof globalThis & { window?: typeof window }).window =
      originalWindow;
    if (typeof window !== 'undefined') {
      const win = window as typeof window & {
        NEXT_PUBLIC_WRITEBACK_MODE?: string;
        NEXT_PUBLIC_FREEZE_DATE?: string;
        OFFICIAL_CLOSE_FIX_ENABLED?: string;
        NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED?: string;
      };
      win.NEXT_PUBLIC_WRITEBACK_MODE = undefined;
      win.NEXT_PUBLIC_FREEZE_DATE = undefined;
      win.OFFICIAL_CLOSE_FIX_ENABLED = undefined;
      win.NEXT_PUBLIC_OFFICIAL_CLOSE_FIX_ENABLED = undefined;
    }
    await clearIndexedDb();
  });

  it('testA: overlay layer keeps priority over packaged and idb', async () => {
    const loadJsonMock = jest.fn<LoadJson>();
    loadJsonMock.mockResolvedValue(
      {
        AAPL: { '2024-01-02': 11 },
      } as Awaited<ReturnType<LoadJson>>,
    );
    const getAllPricesMock = jest.fn<GetAllPrices>();
    getAllPricesMock.mockResolvedValue(
      [
        { symbol: 'AAPL', date: '2024-01-02', close: 10, source: 'official/import' },
      ] as Awaited<ReturnType<GetAllPrices>>,
    );
    const readOverlayMock = jest.fn<ReadOverlay>();
    readOverlayMock.mockResolvedValue(
      [
        {
          symbol: 'AAPL',
          date: '2024-01-02',
          price: 12,
          tsCreated: Date.now(),
          tsUpdated: Date.now(),
          source: 'official_overlay',
        },
      ] as Awaited<ReturnType<ReadOverlay>>,
    );

    jest.unstable_mockModule('@/app/lib/dataSource', () =>
      ({
        loadJson: loadJsonMock,
      }) as unknown as Partial<typeof import('@/app/lib/dataSource')>,
    );
    jest.unstable_mockModule('@/app/lib/services/dataService', () =>
      ({
        getAllPrices: getAllPricesMock,
        isOfficialCloseSource: (jest.requireActual(
          '@/app/lib/services/dataService',
        ) as typeof import('@/app/lib/services/dataService')).isOfficialCloseSource,
      }) as unknown as Partial<typeof import('@/app/lib/services/dataService')>,
    );
    jest.unstable_mockModule('@/app/lib/officialCloseOverlayStore', () =>
      ({
        readOfficialCloseOverlay: readOverlayMock,
        overlayEntriesToMap: (jest.requireActual(
          '@/app/lib/officialCloseOverlayStore',
        ) as typeof import('@/app/lib/officialCloseOverlayStore')).overlayEntriesToMap,
      }) as unknown as Partial<typeof import('@/app/lib/officialCloseOverlayStore')>,
    );

    const {
      buildOfficialCloseMaps,
      resetOfficialCloseVersionForTests,
    } = await import('@/app/lib/prices/buildOfficialCloseMaps');

    resetOfficialCloseVersionForTests();

    const first = await buildOfficialCloseMaps();
    const detail = (first.debug?.detail ?? {}) as DebugDetail;
    const entry = detail.AAPL?.['2024-01-02'];
    expect(entry?.price).toBe(12);
    expect(entry?.source).toBe('official/import');
    expect(entry?.fromLayer).toBe('overlay');

    // packaged 数据不可覆盖 idb 中的 official/import
    readOverlayMock.mockResolvedValueOnce(
      [] as Awaited<ReturnType<ReadOverlay>>,
    );
    loadJsonMock.mockResolvedValueOnce(
      { AAPL: { '2024-01-02': 11 } } as Awaited<ReturnType<LoadJson>>,
    );
    getAllPricesMock.mockResolvedValueOnce(
      [
        { symbol: 'AAPL', date: '2024-01-02', close: 9, source: 'official/import' },
      ] as Awaited<ReturnType<GetAllPrices>>,
    );

    const second = await buildOfficialCloseMaps();
    const secondDetail = (second.debug?.detail ?? {}) as DebugDetail;
    const idbEntry = secondDetail.AAPL?.['2024-01-02'];
    expect(idbEntry?.price).toBe(9);
    expect(idbEntry?.fromLayer).toBe('idb');
  });

  it('testB: version key refreshes on fetch and import', async () => {
    const firstResponse = new Response(
      JSON.stringify({ AAPL: { '2025-01-02': 120 } }),
      { status: 200, headers: { ETag: '"abc"' } },
    );
    const secondResponse = new Response(
      JSON.stringify({ AAPL: { '2025-01-03': 130 } }),
      { status: 200, headers: { ETag: '"def"' } },
    );
    const fetchMock = jest
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    (global as any).fetch = fetchMock;

    const { loadJson } = await import('@/app/lib/dataSource');

    await loadJson('close_prices');
    expect(localStorage.getItem('close_prices_version')).toBe('etag:abc');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/close_prices.json?v='),
      expect.objectContaining({ cache: 'no-store' }),
    );

    await loadJson('close_prices');
    expect(localStorage.getItem('close_prices_version')).toBe('etag:def');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { importClosePrices } = await import('@/app/lib/services/dataService');
    await importClosePrices({ MSFT: { '2025-01-04': 140 } });
    const afterImport = localStorage.getItem('close_prices_version');
    expect(afterImport).not.toBe('etag:def');
  });

  it('testC: basePath helper builds correct URLs for SSR/CSR', async () => {
    const { getClosePricesUrl, getClosePricesFetchInfo } = await import(
      '@/app/lib/prices/closePricesFetch'
    );

    process.env.NEXT_PUBLIC_BASE_PATH = '/demo';
    expect(getClosePricesUrl({ version: '100' })).toBe(
      '/demo/close_prices.json?v=100',
    );

    process.env.NEXT_PUBLIC_BASE_PATH = undefined;
    process.env.NEXT_PUBLIC_ASSET_PREFIX = 'https://cdn.example.com/static';
    expect(getClosePricesUrl({ version: '5' })).toBe(
      'https://cdn.example.com/static/close_prices.json?v=5',
    );

    const savedWindow = global.window;
    // simulate SSR 环境
    // @ts-expect-error - deliberately remove window to emulate server runtime
    delete global.window;
    const info = getClosePricesFetchInfo({ version: '8' });
    expect(info.url).toContain('/close_prices.json?v=8');
    expect(info.init.cache).toBe('no-store');
    global.window = savedWindow;
  });

  it('testD: packaged seeding respects official/import overlays', async () => {
    process.env.NEXT_PUBLIC_FREEZE_DATE = '2025-10-01';
    (window as any).NEXT_PUBLIC_FREEZE_DATE = '2025-10-01';

    const { importClosePrices, getPrice } = await import(
      '@/app/lib/services/dataService'
    );
    await importClosePrices({ AAPL: { '2025-10-01': 12 } });

    const loadJsonMock = jest.fn<LoadJson>();
    loadJsonMock.mockResolvedValue({
      AAPL: { '2025-10-01': 9, '2025-10-02': 13 },
    } as Awaited<ReturnType<LoadJson>>);
    jest.unstable_mockModule('@/app/lib/dataSource', () =>
      ({ loadJson: loadJsonMock }) as unknown as Partial<
        typeof import('@/app/lib/dataSource')
      >,
    );

    const {
      syncPackagedClosesToIdb,
      getLastPackagedSyncStats,
    } = await import('@/app/lib/prices/syncPackagedClosesToIdb');

    const result = await syncPackagedClosesToIdb();
    expect(result.skipped).toBeGreaterThan(0);
    const cached = await getPrice('AAPL', '2025-10-01');
    expect(cached?.close).toBe(12);
    const stats = getLastPackagedSyncStats();
    expect(stats.skipped).toBe(result.skipped);
  });

  it('testE: import writeback reports success and failure paths', async () => {
    const { getPrice } = await import('@/app/lib/services/dataService');
    const { importClosePrices } = await import(
      '@/app/lib/prices/importClosePrices'
    );

    process.env.NEXT_PUBLIC_WRITEBACK_MODE = 'proxy';
    (window as any).NEXT_PUBLIC_WRITEBACK_MODE = 'proxy';

    const successFetch = jest
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    (global as any).fetch = successFetch;

    const ok = await importClosePrices({ MSFT: { '2025-11-01': 55 } });
    expect(ok.writebackStatus).toBe('success');
    expect(successFetch).toHaveBeenCalledWith(
      '/api/close-price',
      expect.objectContaining({ method: 'POST' }),
    );
    const stored = await getPrice('MSFT', '2025-11-01');
    expect(stored?.close).toBe(55);

    const failFetch = jest
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        new Response('fail', { status: 500, statusText: 'oops' }),
      );
    (global as any).fetch = failFetch;
    const failed = await importClosePrices({ MSFT: { '2025-11-02': 65 } });
    expect(failed.writebackStatus).toBe('failed');
    expect(failed.error).toContain('oops');
    const persisted = await getPrice('MSFT', '2025-11-02');
    expect(persisted?.close).toBe(65);
  });

  it('testF: 403 fallback uses API proxy and surfaces failure', async () => {
    const proxySuccess = new Response(
      JSON.stringify({ AAPL: { '2025-01-02': 120 } }),
      { status: 200 },
    );
    const fetchMock = jest
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(proxySuccess);
    (global as any).fetch = fetchMock;

    const { loadJson } = await import('@/app/lib/dataSource');
    const result = await loadJson('close_prices');
    expect(result.AAPL['2025-01-02']).toBe(120);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/close-prices');
    expect(localStorage.getItem('close_prices_version')).toMatch(/^hash:/);

    const failingFetch = jest
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('err', { status: 500 }));
    (global as any).fetch = failingFetch;
    await expect(loadJson('close_prices')).rejects.toThrow(/close_prices.json/);
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });
});
