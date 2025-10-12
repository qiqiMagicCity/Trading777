import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import { getPrevCloseWithin } from '../services/priceService';
import { getPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';
import { isTradingDay, previousTradingDay } from '@/app/lib/nyDay';

type GetPriceMock = jest.MockedFunction<typeof getPrice>;
const getPriceMock = getPrice as GetPriceMock;
const loadJsonMock = loadJson as jest.MockedFunction<typeof loadJson>;

describe('getPrevCloseWithin historical-only', () => {
  beforeEach(() => {
    getPriceMock.mockReset();
    loadJsonMock.mockReset();
    loadJsonMock.mockResolvedValue({});
  });

  test('returns nearest historical *official* close', async () => {
    const ymd = '2025-10-06';

    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === '2025-10-03') {
        return { symbol: 'AAPL', date: lookupDate, close: 152.34, source: 'finnhub' } as any;
      }
      if (lookupDate === '2025-10-02') {
        return { symbol: 'AAPL', date: lookupDate, close: 149.98, source: 'close_fallback' } as any;
      }
      if (lookupDate === '2025-10-07') {
        return { symbol: 'AAPL', date: lookupDate, close: 158.76, source: 'finnhub' } as any;
      }
      return undefined;
    });

    const result = await getPrevCloseWithin('AAPL', ymd, { maxBack: 10, officialOnly: true });

    expect(result && result.ymd <= ymd).toBe(true);
    expect(result?.ymd).toBe('2025-10-03');
    expect(result?.close).toBeCloseTo(152.34);
    expect(result?.source).toBe('finnhub');
    expect(result && isTradingDay(result.ymd)).toBe(true);
  });

  test('never returns future-dated close', async () => {
    const ymd = '2025-10-06';

    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === '2025-10-03') {
        return undefined;
      }
      if (lookupDate === '2025-10-07') {
        return { symbol: 'AAPL', date: lookupDate, close: 158.76, source: 'finnhub' } as any;
      }
      return undefined;
    });

    loadJsonMock.mockResolvedValue({
      AAPL: {
        '2025-10-07': 158.76,
      },
    });

    const result = await getPrevCloseWithin('AAPL', ymd, { maxBack: 1, officialOnly: true });

    expect(result === null || result.ymd <= ymd).toBe(true);
    expect(result).toBeNull();
  });

  test('skips non-trading days via previousTradingDay normalization', async () => {
    const weekend = '2025-10-05';
    const target = previousTradingDay(weekend);

    getPriceMock.mockImplementation(async (_symbol, lookupDate) => {
      if (lookupDate === target) {
        return { symbol: 'AAPL', date: lookupDate, close: 150.01, source: 'tiingo' } as any;
      }
      return undefined;
    });

    const result = await getPrevCloseWithin('AAPL', weekend, { maxBack: 10, officialOnly: true });

    expect(result === null || result.ymd <= target).toBe(true);
    expect(result?.ymd).toBe(target);
  });

  test('maxBack respected: return null when out of window', async () => {
    const ymd = '2025-10-06';

    getPriceMock.mockResolvedValue(undefined);

    const result = await getPrevCloseWithin('AAPL', ymd, { maxBack: 0, officialOnly: true });

    expect(result).toBeNull();
  });
});
