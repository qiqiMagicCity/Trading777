import 'fake-indexeddb/auto';
import { ensureDatasetReady } from '@/app/lib/dataset';
import {
  clearAndImportData,
  importData,
  getAnyTradeCount,
  closeDb,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_BUILTIN,
  DATASET_HASH_KEY,
} from '../services/dataService';
import { BUILTIN_DATASET } from '@/data/builtin';

type StorageShape = Record<string, string>;

function createMemoryStorage(): Storage {
  const store: StorageShape = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

describe('ensureDatasetReady', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    Object.defineProperty(global, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });
    delete process.env.NEXT_PUBLIC_SEED_MODE;
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error cleanup mock storage
    delete global.localStorage;
  });

  it('returns idb and补写 custom 标记当已有数据但未打标', async () => {
    await clearAndImportData(BUILTIN_DATASET as any);

    const custom = {
      positions: [],
      trades: [
        { symbol: "TSDD", price: 11.04, quantity: 10000, date: "2025-05-23", action: "buy", time: "2025-05-23T05:18:31" },
        { symbol: "BA", price: 216.27, quantity: 350, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:03" },
        { symbol: "GOOGL", price: 170.73, quantity: 400, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:27" },
        { symbol: "AMD", price: 151.72, quantity: 380, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:57" },
        { symbol: "PYPL", price: 68.54, quantity: 555, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:20" },
        { symbol: "UAL", price: 103.7, quantity: 300, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:39" },
        { symbol: "DIS", price: 116.83, quantity: 250, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:59" },
        { symbol: "NVDL", price: 84.12, quantity: 330, date: "2025-05-23", action: "buy", time: "2025-05-23T05:22:24" },
      ],
    } as const;

    await importData(custom as any);
    expect(await getAnyTradeCount()).toBe(8);

    localStorage.removeItem(DATASET_SOURCE_KEY);
    localStorage.removeItem('datasetSource');

    const status = await ensureDatasetReady();

    expect(status).toBe('idb');
    expect(await getAnyTradeCount()).toBe(8);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
  });

  it('空库 + off 模式保持 empty', async () => {
    process.env.NEXT_PUBLIC_SEED_MODE = 'off';

    const status = await ensureDatasetReady();

    expect(status).toBe('empty');
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBeNull();
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
  });

  it('空库 + demo 模式会播种并返回 seeded', async () => {
    process.env.NEXT_PUBLIC_SEED_MODE = 'demo';

    const status = await ensureDatasetReady();

    expect(status).toBe('seeded');
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_BUILTIN);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeTruthy();
    expect(await getAnyTradeCount()).toBeGreaterThan(0);

    const second = await ensureDatasetReady();
    expect(second).toBe('idb');
  });

  it('custom 标记时不会覆写本地数据', async () => {
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_CUSTOM);
    process.env.NEXT_PUBLIC_SEED_MODE = 'demo';

    const status = await ensureDatasetReady();

    expect(status).toBe('empty');
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
  });
});
