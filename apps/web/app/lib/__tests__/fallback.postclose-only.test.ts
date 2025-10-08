import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import * as price from '../services/priceService';
import { getPrice, putPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';
import { NoPriceError } from '../priceService';

const getPriceMock = getPrice as unknown as jest.MockedFunction<typeof getPrice>;
const putPriceMock = putPrice as unknown as jest.MockedFunction<typeof putPrice>;
const loadJsonMock = loadJson as unknown as jest.MockedFunction<typeof loadJson>;

const originalFetch = (globalThis as any).fetch;

describe('fallback only after post-close trading days', () => {
  const originalPriceStrict = process.env.PRICE_STRICT;
  const originalSafeMode = process.env.SAFE_PRICE_MODE;

  beforeEach(() => {
    getPriceMock.mockReset();
    putPriceMock.mockReset();
    loadJsonMock.mockReset();
    price.__clearPriceServiceCachesForTest();
    price.__setRuntimeApiKeysForTest(null);
    price.__setEvaluateCloseRequirementForTest(null);
    loadJsonMock.mockResolvedValue({});

    const fetchMock = jest.fn(async () => ({
      ok: false,
      json: async () => ({}),
      text: async () => '',
    })) as jest.Mock;
    (globalThis as any).fetch = fetchMock;

    delete process.env.PRICE_STRICT;
    delete process.env.SAFE_PRICE_MODE;
  });

  afterEach(() => {
    if (originalPriceStrict === undefined) {
      delete process.env.PRICE_STRICT;
    } else {
      process.env.PRICE_STRICT = originalPriceStrict;
    }
    if (originalSafeMode === undefined) {
      delete process.env.SAFE_PRICE_MODE;
    } else {
      process.env.SAFE_PRICE_MODE = originalSafeMode;
    }

    if (originalFetch === undefined) {
      delete (globalThis as any).fetch;
    } else {
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('short-circuits pre-close trading days', async () => {
    price.__setEvaluateCloseRequirementForTest(async () => ({
      require: false,
      reason: 'pre-close',
      date: '2025-10-06',
      close: null,
    } as any));

    try {
      const result = await price.fetchDailyClose('AAPL', '2025-10-06');

      expect(result).toEqual({ skipped: true, reason: 'pre-close' });
      expect(getPriceMock).not.toHaveBeenCalled();
      expect(loadJsonMock).not.toHaveBeenCalled();
      expect(putPriceMock).not.toHaveBeenCalled();
    } finally {
      price.__setEvaluateCloseRequirementForTest(null);
    }
  });

  it('short-circuits future trading dates', async () => {
    price.__setEvaluateCloseRequirementForTest(async () => ({
      require: false,
      reason: 'future-date',
      date: '2099-01-01',
      close: null,
    } as any));

    try {
      const result = await price.fetchDailyClose('AAPL', '2099-01-01');

      expect(result).toEqual({ skipped: true, reason: 'future-date' });
      expect(getPriceMock).not.toHaveBeenCalled();
      expect(loadJsonMock).not.toHaveBeenCalled();
      expect(putPriceMock).not.toHaveBeenCalled();
    } finally {
      price.__setEvaluateCloseRequirementForTest(null);
    }
  });

  it('allows fallback post-close when non-strict', async () => {
    price.__setEvaluateCloseRequirementForTest(async () => ({
      require: true,
      reason: 'post-close',
      date: '2025-10-06',
      close: new Date('2025-10-06T20:00:00Z'),
    } as any));

    try {
      loadJsonMock.mockResolvedValue({
        AAPL: {
          '2025-10-03': 123.45,
        },
      });

      getPriceMock.mockResolvedValue(null);

      const result = await price.fetchDailyClose('AAPL', '2025-10-06');

      expect(result && 'price' in result).toBe(true);
      expect((result as any).price).toBe(123.45);
      expect((result as any).stale).toBe(true);
      expect(putPriceMock).not.toHaveBeenCalled();
    } finally {
      price.__setEvaluateCloseRequirementForTest(null);
    }
  });

  it('rejects fallback in strict modes', async () => {
    process.env.PRICE_STRICT = '1';

    price.__setEvaluateCloseRequirementForTest(async () => ({
      require: true,
      reason: 'post-close',
      date: '2025-10-06',
      close: new Date('2025-10-06T20:00:00Z'),
    } as any));

    try {
      loadJsonMock.mockResolvedValue({
        AAPL: {
          '2025-10-03': 88.8,
        },
      });

      getPriceMock.mockResolvedValue(null);

      await expect(price.fetchDailyClose('AAPL', '2025-10-06')).rejects.toThrow(NoPriceError);
      expect(putPriceMock).not.toHaveBeenCalled();
    } finally {
      price.__setEvaluateCloseRequirementForTest(null);
    }
  });
});
