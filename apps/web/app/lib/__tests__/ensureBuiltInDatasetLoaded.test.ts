import "fake-indexeddb/auto";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";
import {
  clearAndImportData,
  importData,
  getAnyTradeCount,
  closeDb,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_BUILTIN,
  DATASET_HASH_KEY,
  getDatasetSourceMeta,
  getDatasetHashMeta,
  hashPayload,
  markDatasetAsBuiltin,
  clearAllData,
} from "../services/dataService";
import { BUILTIN_DATASET } from "@/data/builtin";

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

describe("ensureBuiltInDatasetLoaded", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    Object.defineProperty(global, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error cleanup mock storage
    delete global.localStorage;
  });

  it("keeps custom dataset across bootstrap reload", async () => {
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

    await ensureBuiltInDatasetLoaded();

    expect(await getAnyTradeCount()).toBe(8);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });

  it("reapplies custom markers when storage keys are reset", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);

    const custom = {
      positions: [],
      trades: [
        { symbol: "AAA", price: 10, quantity: 1, date: "2025-01-01", action: "buy", time: "2025-01-01T09:30:00" },
      ],
    } as const;

    await importData(custom as any);
    expect(await getAnyTradeCount()).toBe(1);

    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    localStorage.setItem("datasetSource", DATASET_SOURCE_BUILTIN);
    localStorage.setItem(DATASET_HASH_KEY, "stale");
    localStorage.setItem("datasetHash", "stale");

    await ensureBuiltInDatasetLoaded();

    expect(await getAnyTradeCount()).toBe(1);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });

  it("promotes builtin markers to custom when database diverges", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);

    const custom = {
      positions: [],
      trades: [
        ...(BUILTIN_DATASET.trades ?? []),
        { symbol: "AAPL", price: 150, quantity: 10, date: "2025-06-01", action: "buy", time: "2025-06-01T09:30:00" },
      ],
    } as const;

    await importData(custom as any);
    expect(await getAnyTradeCount()).toBe((BUILTIN_DATASET.trades ?? []).length + 1);

    const expected = hashPayload(BUILTIN_DATASET);
    await markDatasetAsBuiltin(expected);

    await ensureBuiltInDatasetLoaded();

    expect(await getAnyTradeCount()).toBe((BUILTIN_DATASET.trades ?? []).length + 1);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });

  it("does not fetch trades.json when dataset is custom", async () => {
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_CUSTOM);

    const originalFetch = (global as any).fetch;
    if (!originalFetch) {
      (global as any).fetch = async () => ({ ok: true, json: async () => ({}) });
    }

    const spy = jest.spyOn(global as any, "fetch");

    await ensureBuiltInDatasetLoaded();

    expect(spy).not.toHaveBeenCalledWith(expect.stringMatching(/trades\.json|\/data\/builtin/));
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();

    if (!originalFetch) {
      delete (global as any).fetch;
    }
  });

  it("updates builtin hash markers when dataset already matches", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);

    localStorage.setItem(DATASET_HASH_KEY, "stale");
    localStorage.setItem("datasetHash", "stale");

    await ensureBuiltInDatasetLoaded();

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_BUILTIN);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBe(hashPayload(BUILTIN_DATASET));
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_BUILTIN);
    expect(await getDatasetHashMeta()).toBe(hashPayload(BUILTIN_DATASET));
    expect(await getAnyTradeCount()).toBe((BUILTIN_DATASET.trades ?? []).length);
  });

  it("re-seeds builtin dataset when markers claim builtin but database is empty", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);
    await clearAllData();

    const expected = hashPayload(BUILTIN_DATASET);
    await markDatasetAsBuiltin(expected);

    expect(await getAnyTradeCount()).toBe(0);

    await ensureBuiltInDatasetLoaded();

    expect(await getAnyTradeCount()).toBe((BUILTIN_DATASET.trades ?? []).length);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_BUILTIN);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBe(expected);
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_BUILTIN);
    expect(await getDatasetHashMeta()).toBe(expected);
  });

  it("respects legacy datasetSource custom flag", async () => {
    localStorage.setItem("datasetSource", DATASET_SOURCE_CUSTOM);

    const originalFetch = (global as any).fetch;
    if (!originalFetch) {
      (global as any).fetch = async () => ({ ok: true, json: async () => ({}) });
    }

    const spy = jest.spyOn(global as any, "fetch");

    await ensureBuiltInDatasetLoaded();

    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();

    spy.mockRestore();

    if (!originalFetch) {
      delete (global as any).fetch;
    }
  });
});
