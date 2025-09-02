import { jest } from '@jest/globals';

jest.mock('../services/dataService', () => ({
  getPrice: jest.fn(),
  putPrice: jest.fn(),
}));

jest.mock('@/app/lib/dataSource', () => ({
  loadJson: jest.fn(),
}));

import { fetchRealtimeQuote } from '../services/priceService';
import { NoPriceError } from '../priceService';
import { getPrice } from '../services/dataService';
import { loadJson } from '@/app/lib/dataSource';

describe('fetchRealtimeQuote safe', () => {
  beforeEach(() => {
    (getPrice as jest.Mock).mockReset();
    (loadJson as jest.Mock).mockReset();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
  });

  it('falls back to last close with stale flag and no price 1', async () => {
    (getPrice as jest.Mock).mockResolvedValue({ close: 123 });
    const result = await fetchRealtimeQuote('AAPL');
    expect(result.price).toBe(123);
    expect(result.price).not.toBe(1);
    expect(result.stale).toBe(true);
  });

  it('throws NoPriceError when both realtime and last close fail', async () => {
    (getPrice as jest.Mock).mockResolvedValue(null);
    (loadJson as jest.Mock).mockResolvedValue({});
    await expect(fetchRealtimeQuote('AAPL')).rejects.toThrow(NoPriceError);
  });
});

