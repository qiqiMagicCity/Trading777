import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import { fetchRealtimeQuote, fetchDailyClose, __clearPriceServiceCachesForTest, __setRuntimeApiKeysForTest } from '../services/priceService';
import { NoPriceError } from '../priceService';
import { getPrice, putPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';

const getPriceMock = getPrice as unknown as jest.MockedFunction<typeof getPrice>;
const putPriceMock = putPrice as unknown as jest.MockedFunction<typeof putPrice>;
const loadJsonMock = loadJson as unknown as jest.MockedFunction<typeof loadJson>;
const originalFetch = (global as any).fetch;

describe('priceService safe fallbacks', () => {
  const originalMonitor = process.env.MONITOR;
  const originalPriceStrict = process.env.PRICE_STRICT;
  const originalFinnhubToken = process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
  const originalTiingoToken = process.env.NEXT_PUBLIC_TIINGO_TOKEN;
  const originalRtCloseWindow = process.env.RT_CLOSE_WINDOW_MIN;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    getPriceMock.mockReset();
    putPriceMock.mockReset();
    loadJsonMock.mockReset();
    const fetchMock = jest.fn(async () => ({
      ok: false,
      json: async () => ({}),
      text: async () => '',
    })) as jest.Mock;
    (global as any).fetch = fetchMock as any;
    delete process.env.MONITOR;
    delete process.env.PRICE_STRICT;
    delete process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
    delete process.env.NEXT_PUBLIC_TIINGO_TOKEN;
    delete process.env.RT_CLOSE_WINDOW_MIN;
    __clearPriceServiceCachesForTest();
  });

  afterEach(() => {
    if (originalMonitor === undefined) {
      delete process.env.MONITOR;
    } else {
      process.env.MONITOR = originalMonitor;
    }
    if (originalPriceStrict === undefined) {
      delete process.env.PRICE_STRICT;
    } else {
      process.env.PRICE_STRICT = originalPriceStrict;
    }
    if (originalFinnhubToken === undefined) {
      delete process.env.NEXT_PUBLIC_FINNHUB_TOKEN;
    } else {
      process.env.NEXT_PUBLIC_FINNHUB_TOKEN = originalFinnhubToken;
    }
    if (originalTiingoToken === undefined) {
      delete process.env.NEXT_PUBLIC_TIINGO_TOKEN;
    } else {
      process.env.NEXT_PUBLIC_TIINGO_TOKEN = originalTiingoToken;
    }
    if (originalRtCloseWindow === undefined) {
      delete process.env.RT_CLOSE_WINDOW_MIN;
    } else {
      process.env.RT_CLOSE_WINDOW_MIN = originalRtCloseWindow;
    }
    if (originalFetch === undefined) {
      delete (global as any).fetch;
    } else {
      (global as any).fetch = originalFetch;
    }
    jest.clearAllMocks();
  });

  it('does not overwrite recorded close when called multiple times after market', async () => {
    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    let storedPrice: number | undefined;
    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === '2024-05-20' && storedPrice !== undefined) {
        return { symbol: 'AAPL', date: '2024-05-20', close: storedPrice, source: 'close_rt' } as any;
      }
      return undefined;
    });
    putPriceMock.mockImplementation(async payload => {
      if (payload.date === '2024-05-20') {
        storedPrice = payload.close;
      }
      return payload as any;
    });
    loadJsonMock.mockResolvedValue({});

    const fetchCalls: Array<{ url: string; opts?: RequestInit }> = [];
    (global as any).fetch = jest.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetchCalls.push({ url, opts: init });
      if (url.includes('/api/quote')) {
        return { ok: true, json: async () => ({ c: 256 }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(new Date('2024-05-20T20:01:00Z').getTime());

    const first = await fetchDailyClose('AAPL', '2024-05-20');
    expect(first).toMatchObject({ price: 256, stale: false, priceOk: true });
    expect(storedPrice).toBe(256);
    expect(putPriceMock).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(new Date('2024-05-20T22:30:00Z').getTime());

    const second = await fetchDailyClose('AAPL', '2024-05-20');
    expect(second).toMatchObject({ price: 256, stale: false, priceOk: true });
    expect(putPriceMock).toHaveBeenCalledTimes(1);

    // only the first call should hit realtime quote endpoint
    const quoteCalls = fetchCalls.filter(call => call.url.includes('/api/quote'));
    expect(quoteCalls).toHaveLength(1);

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('treats realtime quotes as official closes within the extended post-market window', async () => {
    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});
    putPriceMock.mockImplementation(async payload => payload as any);

    (global as any).fetch = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/quote')) {
        return { ok: true, json: async () => ({ c: 321 }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(new Date('2024-05-20T20:45:00Z').getTime());

    const result = await fetchDailyClose('AAPL', '2024-05-20');
    expect(result).toMatchObject({ price: 321, stale: false, priceOk: true });
    expect(putPriceMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL', date: '2024-05-20', close: 321, source: 'close_rt' }),
    );

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('continues to accept realtime closes on the next calendar day before the market reopens', async () => {
    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});
    putPriceMock.mockImplementation(async payload => payload as any);

    (global as any).fetch = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/quote')) {
        return { ok: true, json: async () => ({ c: 400 }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(new Date('2024-05-25T13:29:00-04:00').getTime());

    const result = await fetchDailyClose('AAPL', '2024-05-24');
    expect(result).toMatchObject({ price: 400, stale: false, priceOk: true });
    expect(putPriceMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL', date: '2024-05-24', close: 400, source: 'close_rt' }),
    );

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('records official close from cached realtime quotes when quote APIs are unavailable', async () => {
    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});
    putPriceMock.mockImplementation(async payload => payload as any);

    const fetchMock = jest.fn() as jest.Mock;
    (global as any).fetch = fetchMock as any;

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(new Date('2025-09-26T20:05:00Z').getTime());

    (fetchMock as any).mockResolvedValueOnce({ ok: true, json: async () => ({ c: 512 }) });

    const realtime = await fetchRealtimeQuote('AAPL');
    expect(realtime).toMatchObject({ price: 512, stale: false, priceOk: true });

    dateNowSpy.mockReturnValue(new Date('2025-09-27T13:30:00Z').getTime());

    (fetchMock as any).mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/close-price')) {
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      return { ok: false, statusText: 'down', json: async () => ({}) };
    });

    const close = await fetchDailyClose('AAPL', '2025-09-26');
    expect(close).toMatchObject({ price: 512, stale: false, priceOk: true });
    expect(putPriceMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL', date: '2025-09-26', close: 512, source: 'close_rt' }),
    );

    const quoteCalls = (fetchMock.mock.calls as any[]).filter(([input]: [any]) =>
      typeof input === 'string' ? input.includes('/api/quote') : String(input).includes('/api/quote'),
    );
    expect(quoteCalls).toHaveLength(1);

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('falls back to caller-provided close when realtime APIs are unreachable after the close', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});
    putPriceMock.mockImplementation(async payload => payload as any);

    const fetchMock = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/close-price')) {
        return { ok: true, json: async () => ({ ok: true }) } as any;
      }
      return { ok: false, json: async () => ({}) } as any;
    }) as jest.Mock;
    (global as any).fetch = fetchMock as any;

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(new Date('2024-05-21T12:30:00Z').getTime());

    const result = await fetchDailyClose('MSFT', '2024-05-20', { fallbackClose: 410.5 });
    expect(result).toMatchObject({ price: 410.5, stale: false, priceOk: true });
    expect(putPriceMock).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'MSFT', date: '2024-05-20', close: 410.5, source: 'close_fallback' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/close-price'),
      expect.objectContaining({
        body: JSON.stringify({ symbol: 'MSFT', date: '2024-05-20', close: 410.5 }),
      }),
    );

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('awaits file persistence before resolving realtime closes', async () => {
    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});
    putPriceMock.mockImplementation(async payload => payload as any);

    let persisted = false;

    (global as any).fetch = jest.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/quote')) {
        return { ok: true, json: async () => ({ c: 333 }) };
      }
      if (url.includes('/api/close-price')) {
        await Promise.resolve();
        persisted = true;
        return { ok: true, json: async () => ({ ok: true }), text: async () => '' };
      }
      return { ok: true, json: async () => ({}) };
    });

    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(new Date('2025-09-27T13:25:00-04:00').getTime());

    const result = await fetchDailyClose('AAPL', '2025-09-26');
    expect(result).toMatchObject({ price: 333, stale: false, priceOk: true });
    expect(persisted).toBe(true);

    dateNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('falls back to last close with stale flag and no price 1', async () => {
    getPriceMock.mockResolvedValue({ symbol: 'AAPL', date: '2024-04-10', close: 123, source: 'import' });
    const result = await fetchRealtimeQuote('AAPL');
    expect(result?.price).toBe(123);
    expect(result?.price).not.toBe(1);
    expect(result?.stale).toBe(true);
    expect(result?.priceOk).toBe(true);
  });

  it('reuses cached realtime price when upstream APIs fail', async () => {
    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});

    __setRuntimeApiKeysForTest({ finnhub: 'demo', tiingo: 'demo' });

    let apiCallCount = 0;
    (global as any).fetch = jest.fn(async () => {
      apiCallCount += 1;
      if (apiCallCount === 1) {
        return { ok: true, json: async () => ({ c: 256 }) };
      }
      return { ok: false, statusText: 'rate limit', json: async () => ({}) };
    });

    const first = await fetchRealtimeQuote('AAPL');
    expect(first.price).toBe(256);
    expect(first.stale).toBe(false);

    const second = await fetchRealtimeQuote('AAPL');
    expect(second.price).toBe(256);
    expect(second.stale).toBe(true);
    expect(second.priceOk).toBe(true);
  });

  it('falls back to the latest available close even when data is stale', async () => {
    process.env.MONITOR = '1';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({ AAPL: { '2024-03-01': 105, '2024-04-09': 110 } });

    const result = await fetchDailyClose('AAPL', '2024-05-20');
    expect(result?.price).toBe(110);
    expect(result?.stale).toBe(true);
    expect(
      warnSpy.mock.calls.some(([msg]) => typeof msg === 'string' && msg.includes('使用前一收盘价作为回退')),
    ).toBe(true);

    warnSpy.mockRestore();
  });

  it('returns null when close is unavailable and strict mode is off', async () => {
    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});

    const result = await fetchDailyClose('AAPL', '2024-04-10');
    expect(result).toBeNull();
  });

  it('falls back to a future close price when dataset is ahead of the request date', async () => {
    process.env.MONITOR = '1';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({ AAPL: { '2025-08-01': 130 } });

    const result = await fetchDailyClose('AAPL', '2024-04-10');
    expect(result).toMatchObject({ price: 130, stale: true, priceOk: true });
    expect(
      warnSpy.mock.calls.some(
        ([msg, payload]) =>
          typeof msg === 'string' &&
          msg.includes('使用未来收盘价作为回退') &&
          payload && (payload as { fallbackDate?: string }).fallbackDate === '2025-08-01',
      ),
    ).toBe(true);

    warnSpy.mockRestore();
  });

  it('returns the latest historical close when realtime quotes are unavailable for an outdated dataset', async () => {
    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({ AAPL: { '2024-01-15': 99 } });

    const result = await fetchRealtimeQuote('AAPL');
    expect(result).toMatchObject({ price: 99, stale: true, priceOk: true });
  });

  it('normalizes ISO datetime inputs when looking up daily closes', async () => {
    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === '2024-05-20') {
        return { symbol: 'AAPL', date: '2024-05-20', close: 321, source: 'import' } as any;
      }
      return undefined;
    });

    const result = await fetchDailyClose('AAPL', '2024-05-20T15:30:00.000Z');
    expect(result).toMatchObject({ price: 321, stale: false, priceOk: true });
  });

  it('returns priceOk false when realtime and fallback quotes are missing', async () => {
    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});

    const result = await fetchRealtimeQuote('AAPL');
    expect(result).toMatchObject({ priceOk: false, change: null, changePct: null });
    expect(result.price).toBeUndefined();
    expect(result.stale).toBeUndefined();
  });

  it('propagates NoPriceError when strict mode is enforced', async () => {
    process.env.PRICE_STRICT = '1';
    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({});

    await expect(fetchRealtimeQuote('AAPL')).rejects.toThrow(NoPriceError);
  });

  afterAll(() => {
    jest.useRealTimers();
  });
});
