import { jest } from '@jest/globals';

describe('assertM6', () => {
  beforeEach(() => {
    jest.resetModules();
    (globalThis as any).window = {};
    (globalThis as any).location = { search: '' };
    process.env.NEXT_PUBLIC_DEBUG_METRICS = '1';
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).location;
    delete process.env.NEXT_PUBLIC_DEBUG_METRICS;
    jest.restoreAllMocks();
  });

  it('does not warn when M6 matches', async () => {
    const { assertM6 } = await import('../metrics');
    const { logger } = await import('../logger');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const metrics = {
      M3: 1,
      M4: 2,
      M5: { trade: 0, fifo: 3 },
      M6: 6,
    } as any;
    assertM6(metrics);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when M6 mismatches', async () => {
    const { assertM6 } = await import('../metrics');
    const { logger } = await import('../logger');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const metrics = {
      M3: 1,
      M4: 2,
      M5: { trade: 0, fifo: 3 },
      M6: 7,
    } as any;
    assertM6(metrics);
    expect(warn).toHaveBeenCalled();
  });
});
