import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import {
  fetchDailyClose,
  evaluateCloseRequirement,
  __clearPriceServiceCachesForTest,
  __setRuntimeApiKeysForTest,
} from '../services/priceService';
import { getPrice, putPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';

const getPriceMock = getPrice as unknown as jest.MockedFunction<typeof getPrice>;
const putPriceMock = putPrice as unknown as jest.MockedFunction<typeof putPrice>;
const loadJsonMock = loadJson as unknown as jest.MockedFunction<typeof loadJson>;

const originalFetch = (globalThis as any).fetch;

describe('fetchDailyClose non-trading day short-circuit', () => {
  const originalStrict = process.env.PRICE_STRICT;

  beforeEach(() => {
    getPriceMock.mockReset();
    putPriceMock.mockReset();
    loadJsonMock.mockReset();
    __clearPriceServiceCachesForTest();
    __setRuntimeApiKeysForTest(null);
    loadJsonMock.mockResolvedValue({});

    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })) as jest.Mock;
    (globalThis as any).fetch = fetchMock;

    if (originalStrict === undefined) {
      delete process.env.PRICE_STRICT;
    } else {
      process.env.PRICE_STRICT = originalStrict;
    }
  });

  afterEach(() => {
    if (originalStrict === undefined) {
      delete process.env.PRICE_STRICT;
    } else {
      process.env.PRICE_STRICT = originalStrict;
    }

    if (originalFetch === undefined) {
      delete (globalThis as any).fetch;
    } else {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('short-circuits weekend requests before any provider call', async () => {
    const decision = await evaluateCloseRequirement('2025-10-05');
    expect(decision.require).toBe(false);
    expect(decision.reason).toBe('non-trading-day');

    const result = await fetchDailyClose('AAPL', '2025-10-05');

    expect(result).toEqual({ skipped: true, reason: 'non-trading-day' });
    expect(getPriceMock).not.toHaveBeenCalled();
    expect(putPriceMock).not.toHaveBeenCalled();
    expect(loadJsonMock).not.toHaveBeenCalled();
    expect((globalThis.fetch as jest.Mock)).not.toHaveBeenCalled();
  });

  it('short-circuits exchange holidays without hitting fallbacks', async () => {
    const decision = await evaluateCloseRequirement('2025-12-25');
    expect(decision.require).toBe(false);
    expect(decision.reason).toBe('non-trading-day');

    const result = await fetchDailyClose('AAPL', '2025-12-25');

    expect(result).toEqual({ skipped: true, reason: 'non-trading-day' });
    expect(getPriceMock).not.toHaveBeenCalled();
    expect(putPriceMock).not.toHaveBeenCalled();
    expect(loadJsonMock).not.toHaveBeenCalled();
    expect((globalThis.fetch as jest.Mock)).not.toHaveBeenCalled();
  });

  it('does not raise STRICT alerts on non-trading days', async () => {
    process.env.PRICE_STRICT = '1';

    await expect(fetchDailyClose('AAPL', '2025-12-27')).resolves.toEqual({
      skipped: true,
      reason: 'non-trading-day',
    });

    expect(getPriceMock).not.toHaveBeenCalled();
    expect(putPriceMock).not.toHaveBeenCalled();
  });

  it('continues normal flow on historical trading days', async () => {
    const tradingDay = '2023-10-06';
    getPriceMock.mockResolvedValue({
      symbol: 'AAPL',
      date: tradingDay,
      close: 189.9,
      source: 'cache',
    } as any);

    const result = await fetchDailyClose('AAPL', tradingDay);

    expect(result).not.toEqual({ skipped: true, reason: expect.any(String) });
    expect(result && (result as any).skipped).not.toBe(true);
    expect(getPriceMock).toHaveBeenCalledTimes(1);
  });
});

