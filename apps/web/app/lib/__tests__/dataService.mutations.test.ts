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

function cloneSeed(): Parameters<typeof clearAndImportData>[0] {
  return {
    positions: [],
    trades: builtinSeed.trades.map((t) => ({ ...t })),
  };
}

describe("trade mutations promote dataset to custom", () => {
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    // @ts-expect-error assign mock fetch for persistence side effects
    global.fetch = fetchMock;
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error remove mocked storage between tests
    delete global.localStorage;
    // @ts-expect-error cleanup mock fetch between tests
    delete global.fetch;
  });

  test("addTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData(cloneSeed());

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_BUILTIN,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).not.toBeNull();

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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.trades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "NEW", action: "buy" }),
      ]),
    );
  });

  test("updateTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData(cloneSeed());
    const [existing] = await findTrades();
    if (!existing) {
      throw new Error("seed trade missing after import");
    }

    await updateTrade({
      ...existing,
      price: existing.price + 1,
    });

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("deleteTrade marks dataset as custom", async () => {
    const store: Record<string, string> = {};
    mockLocalStorage(store);

    await clearAndImportData(cloneSeed());
    const [existing] = await findTrades();
    if (!existing) {
      throw new Error("seed trade missing after import");
    }

    await deleteTrade(existing.id!);

    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
