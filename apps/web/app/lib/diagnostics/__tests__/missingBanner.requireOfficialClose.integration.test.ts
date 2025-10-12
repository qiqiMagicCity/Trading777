/** @jest-environment jsdom */

import 'fake-indexeddb/auto';

import { jest } from '@jest/globals';

import { seedClosePricesForTest } from '@/app/lib/prices/seedTest';
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
import { getMissingOfficialCloses } from '@/app/lib/prices/officialCloseFacade';
import {
  setLatestOfficialCloseMaps,
  setLatestMissingOfficialEntries,
} from '@/app/lib/prices/officialCloseCache';
import { filterMissingOfficialEntries } from '@/app/lib/prices/filterMissingOfficialCloses';
import { useStore } from '@/app/lib/store';
import type { MetricsContract } from '@/app/lib/types/metrics';
import * as dataSource from '@/app/lib/dataSource';

async function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const factory = indexedDB as typeof indexedDB & {
    deleteDatabase?: typeof indexedDB.deleteDatabase;
  };
  if (typeof factory.deleteDatabase !== 'function') return;
  await new Promise<void>((resolve) => {
    const request = factory.deleteDatabase!(name);
    request.onblocked = () => resolve();
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
  });
}

async function resetIndexedDb(): Promise<void> {
  await deleteDatabase('TradingApp');
  await deleteDatabase('TradingOfficialCloseOverlay');
}

const MISSING_ENTRIES: MetricsContract['diagnostics']['missingOfficialCloses'] = [
  {
    symbol: 'AMD',
    date: '2025-09-19',
    purposes: ['runAll'],
    impact: [],
    hasFallback: false,
  },
  {
    symbol: 'AMZN',
    date: '2025-10-03',
    purposes: ['runAll'],
    impact: [],
    hasFallback: false,
  },
  {
    symbol: 'BA',
    date: '2025-10-03',
    purposes: ['runAll'],
    impact: [],
    hasFallback: false,
  },
];

function setStoreMetrics(): void {
  const metrics: MetricsContract = {
    M1: 0,
    M2: 0,
    M3: 0,
    M4: 0,
    M5: { behavior: 0, fifo: 0 },
    M6: { total: 0 },
    diagnostics: {
      missingOfficialCloses: MISSING_ENTRIES.slice(),
      pendingOfficialCloses: [],
    },
  } as MetricsContract;
  const store = useStore.getState();
  store.setMetrics(metrics);
}

describe('missing banner uses requireOfficialClose verdict', () => {
  const originalLoadJson = dataSource.loadJson;

  beforeEach(async () => {
    jest.spyOn(dataSource, 'loadJson').mockImplementation(async (name) => {
      if (name === 'close_prices') {
        return {};
      }
      return originalLoadJson(name as never);
    });
    await resetIndexedDb();
    resetPricesReadyForTests();
    resetOfficialCloseVersionForTests();
    const store = useStore.getState();
    store.setMetrics(null);
    store.setOfficialCloseVersion(0);
    setLatestOfficialCloseMaps(null);
    setLatestMissingOfficialEntries(null);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await resetIndexedDb();
    setLatestOfficialCloseMaps(null);
  });

  it('omits symbols fulfilled by official/import records in IndexedDB', async () => {
    setStoreMetrics();
    await seedClosePricesForTest(
      {
        AMD: { '2025-09-19': 157.39 },
        AMZN: { '2025-10-03': 219.51 },
        BA: { '2025-10-03': 216.3 },
      },
      { source: 'official/import' },
    );

    beginBuild();
    const { version, maps, debug } = await buildOfficialCloseMaps();
    setLatestOfficialCloseMaps({
      official: maps.official,
      overlay: maps.overlay,
      packaged: maps.packaged,
      idb: debug?.idb ?? {},
    });
    const filtered = filterMissingOfficialEntries(MISSING_ENTRIES.slice(), {
      official: maps.official,
      overlay: maps.overlay,
      idb: debug?.idb ?? {},
    });
    setLatestMissingOfficialEntries(filtered);
    beginCommit(version);
    commitOfficialCloseVersion(version);
    const store = useStore.getState();
    store.setOfficialCloseVersion(version);
    markPricesReady(version);

    const missing = await getMissingOfficialCloses(version);
    expect(missing).toEqual({});
  });

  it('retains symbols when no official close exists in idb/overlay', async () => {
    setStoreMetrics();

    beginBuild();
    const { version, maps, debug } = await buildOfficialCloseMaps();
    setLatestOfficialCloseMaps({
      official: maps.official,
      overlay: maps.overlay,
      packaged: maps.packaged,
      idb: debug?.idb ?? {},
    });
    const filtered = filterMissingOfficialEntries(MISSING_ENTRIES.slice(), {
      official: maps.official,
      overlay: maps.overlay,
      idb: debug?.idb ?? {},
    });
    setLatestMissingOfficialEntries(filtered);
    beginCommit(version);
    commitOfficialCloseVersion(version);
    const store = useStore.getState();
    store.setOfficialCloseVersion(version);
    markPricesReady(version);

    const missing = await getMissingOfficialCloses(version);
    expect(Object.keys(missing)).toEqual([
      '2025-10-03',
      '2025-09-19',
    ]);
    expect(missing['2025-09-19']?.map((item) => item.symbol)).toEqual(['AMD']);
    expect(missing['2025-10-03']?.map((item) => item.symbol)).toEqual([
      'AMZN',
      'BA',
    ]);
  });
});
