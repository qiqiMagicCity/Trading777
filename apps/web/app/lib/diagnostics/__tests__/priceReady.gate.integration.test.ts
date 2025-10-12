import {
  beginBuild,
  beginCommit,
  markPricesReady,
  waitUntilAtLeast,
  current,
  resetPricesReadyForTests,
} from '@/app/lib/prices/ready';

describe('price ready gate', () => {
  beforeEach(() => {
    resetPricesReadyForTests();
  });

  it('listeners do not resolve before commit+ready', async () => {
    beginBuild();
    const waiter = waitUntilAtLeast(1);
    let settled = false;
    void waiter.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    beginCommit(1);
    markPricesReady(1);

    const payload = await waiter;
    expect(payload.version).toBe(1);
    expect(current().phase).toBe('READY');
    expect(current().version).toBe(1);
  });
});
