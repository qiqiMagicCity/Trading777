import 'fake-indexeddb/auto';
import {
  waitOfficialClosesReady,
  getMissingOfficialCloses,
} from '@/app/lib/prices/officialCloseFacade';
import {
  beginBuild,
  beginCommit,
  markPricesReady,
  resetPricesReadyForTests,
} from '@/app/lib/prices/ready';
import {
  buildOfficialCloseMaps,
  commitOfficialCloseVersion,
  resetOfficialCloseVersionForTests,
} from '@/app/lib/prices/buildOfficialCloseMaps';
import { useStore } from '@/app/lib/store';
import { seedClosePricesForTest } from '@/app/lib/prices/seedTest';

describe('yellow banner', () => {
  beforeEach(() => {
    resetPricesReadyForTests();
    resetOfficialCloseVersionForTests();
    const store = useStore.getState();
    store.setOfficialCloseVersion(0);
    store.setMetrics(null);
  });

  it('clears missing gaps after importing close prices', async () => {
    const FIX: Record<string, Record<string, number>> = {
      '2025-09-19': {
        AMD: 157.39,
        BA: 215.65,
        DIS: 113.76,
        GOOGL: 254.72,
        NVDL: 84.4,
        PYPL: 68.22,
        TSDD: 11.12,
        UAL: 106.31,
      },
      '2025-10-03': {
        AMZN: 219.51,
        APP: 682.76,
        BA: 216.3,
        DIS: 112.47,
        GOOGL: 245.35,
        INTC: 36.83,
        PYPL: 69.25,
        SCHW: 94.08,
        UAL: 95.33,
      },
    };

    await seedClosePricesForTest(FIX, { source: 'import' });

    beginBuild();
    const { version } = await buildOfficialCloseMaps();
    beginCommit(version);
    const readyPromise = waitOfficialClosesReady(version);
    commitOfficialCloseVersion(version);
    useStore.getState().setOfficialCloseVersion(version);
    markPricesReady(version);
    await readyPromise;

    const missing = await getMissingOfficialCloses(version);
    expect(missing['2025-09-19'] ?? []).toEqual([]);
    expect(missing['2025-10-03'] ?? []).toEqual([]);
  });
});
