import "fake-indexeddb/auto";

import {
  addTrade,
  updateTrade,
  deleteTrade,
  clearAndImportData,
  closeDb,
  findTrades,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_BUILTIN,
  DATASET_SOURCE_CUSTOM,
  DATASET_HASH_KEY,
  getDatasetSourceMeta,
  getDatasetHashMeta,
} from "../services/dataService";

function mockLocalStorage(store: Record<string, string>) {
  Object.defineProperty(global, "localStorage", {
    value: {
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
    },
    configurable: true,
  });
}

const builtinSeed = {
  positions: [],
  trades: [
    {
      symbol: "BASE",
      price: 10,
      quantity: 1,
      date: "2025-05-20",
      action: "buy" as const,
    },
  ],
} as const;

describe("trade mutations promote dataset to custom", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error remove mocked storage between tests
    delete global.localStorage;
  });

  test("addTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData({ ...builtinSeed });

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_BUILTIN,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).not.toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_BUILTIN);
    expect(await getDatasetHashMeta()).not.toBeNull();

    await addTrade({
      symbol: "NEW",
      price: 12,
      quantity: 2,
      date: "2025-05-21",
      action: "buy",
    });

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(localStorage.getItem("datasetSource")).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem("datasetHash")).toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });

  test("updateTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData({ ...builtinSeed });
    const [existing] = await findTrades();

    await updateTrade({
      ...existing,
      price: existing.price + 1,
    });

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });

  test("deleteTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData({ ...builtinSeed });
    const [existing] = await findTrades();

    await deleteTrade(existing.id!);

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(await getDatasetSourceMeta()).toBe(DATASET_SOURCE_CUSTOM);
    expect(await getDatasetHashMeta()).toBeNull();
  });
});
