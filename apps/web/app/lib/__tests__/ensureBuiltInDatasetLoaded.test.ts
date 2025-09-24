import "fake-indexeddb/auto";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";
import {
  clearAndImportData,
  importData,
  getAnyTradeCount,
  closeDb,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
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

  it("respects legacy datasetSource custom flag", async () => {
    localStorage.setItem("datasetSource", DATASET_SOURCE_CUSTOM);

    const originalFetch = (global as any).fetch;
    if (!originalFetch) {
      (global as any).fetch = async () => ({ ok: true, json: async () => ({}) });
    }

    const spy = jest.spyOn(global as any, "fetch");

    await ensureBuiltInDatasetLoaded();

    expect(spy).not.toHaveBeenCalled();
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBeNull();

    spy.mockRestore();

    if (!originalFetch) {
      delete (global as any).fetch;
    }
  });
});
