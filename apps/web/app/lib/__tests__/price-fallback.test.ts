import { getSafePrice, MissingPriceError } from '../priceService';

describe('getSafePrice', () => {
  it('uses quote when available', () => {
    expect(getSafePrice({ quote: 12, lastClose: 10 })).toEqual({ price: 12, stale: false });
  });
  it('falls back to lastClose with stale flag', () => {
    expect(getSafePrice({ lastClose: 10 })).toEqual({ price: 10, stale: true });
  });
  it('throws when both missing', () => {
    expect(() => getSafePrice({})).toThrow(MissingPriceError);
  });
});
