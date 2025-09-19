import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import { fetchRealtimeQuote, fetchDailyClose } from '../services/priceService';
import { NoPriceError } from '../priceService';
import { getPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';

const getPriceMock = getPrice as unknown as jest.MockedFunction<typeof getPrice>;
const loadJsonMock = loadJson as unknown as jest.MockedFunction<typeof loadJson>;
const originalFetch = (global as any).fetch;

describe('priceService safe fallbacks', () => {
  const originalMonitor = process.env.MONITOR;
  const originalPriceStrict = process.env.PRICE_STRICT;

  beforeEach(() => {
    getPriceMock.mockReset();
    loadJsonMock.mockReset();
    const fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    (global as any).fetch = fetchMock;
    delete process.env.MONITOR;
    delete process.env.PRICE_STRICT;
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
    if (originalFetch === undefined) {
      delete (global as any).fetch;
    } else {
      (global as any).fetch = originalFetch;
    }
    jest.clearAllMocks();
  });

  it('falls back to last close with stale flag and no price 1', async () => {
    getPriceMock.mockResolvedValue({ symbol: 'AAPL', date: '2024-04-10', close: 123, source: 'import' });
    const result = await fetchRealtimeQuote('AAPL');
    expect(result?.price).toBe(123);
    expect(result?.price).not.toBe(1);
    expect(result?.stale).toBe(true);
  });

  it('looks back up to seven days for fallback close and logs when enabled', async () => {
    process.env.MONITOR = '1';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    getPriceMock.mockResolvedValue(undefined);
    loadJsonMock.mockResolvedValue({ AAPL: { '2024-04-09': 110 } });

    const result = await fetchDailyClose('AAPL', '2024-04-10');
    expect(result).toEqual({ price: 110, stale: true });
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
});
