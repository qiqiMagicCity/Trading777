import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import { buildMissingCloseList } from '@/app/lib/dailyResults';
import { resolveTradingDayStr, isTradingDay } from '@/app/lib/nyDay';
import {
  fetchDailyClose,
  __clearPriceServiceCachesForTest,
  __setEvaluateCloseRequirementForTest,
  type CloseRequirementDecision,
} from '@/app/lib/services/priceService';
import { NoPriceError } from '@/app/lib/priceService';
import { getPrice, putPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';

const WEEKEND = '2025-10-05';
const HOLIDAY = '2025-12-25';
const TRADING = '2025-10-06';
const POST_CLOSE_DECISION: CloseRequirementDecision = {
  require: true,
  reason: 'post-close',
  date: TRADING,
  close: new Date('2025-10-06T16:00:00-04:00'),
};

const originalFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
const originalSafeMode = process.env.SAFE_PRICE_MODE;
const originalFetch = (globalThis as any).fetch;

const getPriceMock = getPrice as jest.MockedFunction<typeof getPrice>;
const putPriceMock = putPrice as jest.MockedFunction<typeof putPrice>;
const loadJsonMock = loadJson as jest.MockedFunction<typeof loadJson>;

const OFFICIAL_HISTORY = {
  AAPL: {
    '2025-10-03': 150.12,
  },
};

let fetchMock: jest.Mock;

describe('E2E trading-day pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearPriceServiceCachesForTest();
    __setEvaluateCloseRequirementForTest(null);

    getPriceMock.mockReset();
    putPriceMock.mockReset();
    loadJsonMock.mockReset();

    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === '2025-10-03') {
        return {
          symbol: 'AAPL',
          date: '2025-10-03',
          close: 150.12,
          source: 'finnhub',
        } as any;
      }
      return undefined;
    });
    loadJsonMock.mockResolvedValue(OFFICIAL_HISTORY as any);

    fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    })) as jest.Mock;
    (globalThis as any).fetch = fetchMock;

    if (originalFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = originalFreeze;
    }

    if (originalSafeMode === undefined) {
      delete process.env.SAFE_PRICE_MODE;
    } else {
      process.env.SAFE_PRICE_MODE = originalSafeMode;
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
    __clearPriceServiceCachesForTest();
    __setEvaluateCloseRequirementForTest(null);

    if (originalFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = originalFreeze;
    }

    if (originalSafeMode === undefined) {
      delete process.env.SAFE_PRICE_MODE;
    } else {
      process.env.SAFE_PRICE_MODE = originalSafeMode;
    }
  });

  afterAll(() => {
    if (originalFetch === undefined) {
      delete (globalThis as any).fetch;
    } else {
      (globalThis as any).fetch = originalFetch;
    }
  });

  describe('Weekend/Holiday short-circuit and banner', () => {
    test('weekend: skipped + no network + banner excludes', async () => {
      process.env.NEXT_PUBLIC_FREEZE_DATE = WEEKEND;
      const resolved = resolveTradingDayStr(undefined, { freeze: WEEKEND });

      expect(isTradingDay(WEEKEND)).toBe(false);
      expect(isTradingDay(resolved)).toBe(true);

      const result = await fetchDailyClose('AAPL', WEEKEND);

      expect(result).toEqual({ kind: 'skipped', skipped: true, reason: 'non-trading-day' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getPriceMock).not.toHaveBeenCalled();
      expect(putPriceMock).not.toHaveBeenCalled();

      const list = await buildMissingCloseList({ from: WEEKEND, to: WEEKEND });

      expect(list.some((entry: any) => entry.ymd === WEEKEND)).toBe(false);
    });

    test('holiday: skipped + no network + banner excludes', async () => {
      process.env.NEXT_PUBLIC_FREEZE_DATE = HOLIDAY;
      const resolved = resolveTradingDayStr(undefined, { freeze: HOLIDAY });

      expect(isTradingDay(HOLIDAY)).toBe(false);
      expect(isTradingDay(resolved)).toBe(true);

      const result = await fetchDailyClose('AAPL', HOLIDAY);

      expect(result).toEqual({ kind: 'skipped', skipped: true, reason: 'non-trading-day' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getPriceMock).not.toHaveBeenCalled();
      expect(putPriceMock).not.toHaveBeenCalled();

      const list = await buildMissingCloseList({ from: HOLIDAY, to: HOLIDAY });

      expect(list.some((entry: any) => entry.ymd === HOLIDAY)).toBe(false);
    });
  });

  describe('Trading day behavior (post-close vs pre-close)', () => {
    test('pre-close path: may skip; never fallback', async () => {
      __setEvaluateCloseRequirementForTest(async () => ({
        require: false,
        reason: 'pre-close',
        date: TRADING,
        close: new Date('2025-10-06T14:30:00-04:00'),
      }));

      const result = await fetchDailyClose('AAPL', TRADING);

      expect(result).toEqual({ kind: 'skipped', skipped: true, reason: 'pre-close' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getPriceMock).not.toHaveBeenCalled();
    });

    test('post-close + non-strict may fallback to historical official when missing', async () => {
      __setEvaluateCloseRequirementForTest(async () => POST_CLOSE_DECISION);
      process.env.SAFE_PRICE_MODE = 'lenient';

      const result = await fetchDailyClose('AAPL', TRADING);

      expect(result?.kind).toBe('quote');
      if (result && result.kind === 'quote') {
        expect(result.price).toBeCloseTo(150.12);
        expect(result.stale).toBe(true);
      }
    });

    test('post-close + strict forbids fallback when official close absent', async () => {
      __setEvaluateCloseRequirementForTest(async () => POST_CLOSE_DECISION);
      process.env.SAFE_PRICE_MODE = 'strict';

      await expect(fetchDailyClose('AAPL', TRADING)).rejects.toThrow(NoPriceError);
    });
  });
});
