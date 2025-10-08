describe('getSafePrice', () => {
  const originalMode = process.env.SAFE_PRICE_MODE;

  afterAll(() => {
    if (typeof originalMode === 'undefined') {
      delete process.env.SAFE_PRICE_MODE;
    } else {
      process.env.SAFE_PRICE_MODE = originalMode;
    }
  });

  it('uses quote when available (strict mode default)', () => {
    delete process.env.SAFE_PRICE_MODE;
    jest.isolateModules(() => {
      const { getSafePrice } = require('../priceService');
      expect(getSafePrice({ quote: 12, lastClose: 10 })).toEqual({ price: 12, stale: false });
    });
  });

  it('throws MissingOfficialCloseError when only lastClose is provided in strict mode', () => {
    process.env.SAFE_PRICE_MODE = 'strict';
    jest.isolateModules(() => {
      const { getSafePrice, MissingOfficialCloseError } = require('../priceService');
      expect(() => getSafePrice({ lastClose: 10 })).toThrow(MissingOfficialCloseError);
    });
  });

  it('falls back to lastClose with stale flag in legacy mode', () => {
    process.env.SAFE_PRICE_MODE = 'legacy';
    jest.isolateModules(() => {
      const { getSafePrice } = require('../priceService');
      expect(getSafePrice({ lastClose: 10 })).toEqual({ price: 10, stale: true });
    });
  });

  it('throws NoPriceError when both missing in legacy mode', () => {
    process.env.SAFE_PRICE_MODE = 'legacy';
    jest.isolateModules(() => {
      const { getSafePrice, NoPriceError } = require('../priceService');
      expect(() => getSafePrice({})).toThrow(NoPriceError);
    });
  });
});
