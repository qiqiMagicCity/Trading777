import "fake-indexeddb/auto";
import { openDB } from "idb";
import {
  importData,
  clearAndImportData,
  closeDb,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_BUILTIN,
} from "../services/dataService";

function setupLocalStorage(store: Record<string, string>) {
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
        for (const key of Object.keys(store)) delete store[key];
      },
    },
    configurable: true,
  });
}

describe("importData builtin guard", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error cleanup mocked storage
    delete global.localStorage;
  });

  test("custom import overwrites builtin dataset", async () => {
    const store: Record<string, string> = {};
    setupLocalStorage(store);

    const builtinSeed = {
      positions: [],
      trades: [
        {
          date: "2025-07-01",
          symbol: "BUILTIN",
          side: "BUY" as const,
          qty: 2,
          price: 55,
        },
      ],
    };

    await clearAndImportData(builtinSeed);

    const customPayload: Parameters<typeof importData>[0] = {
      positions: [],
      trades: [
        {
          symbol: "CUSTOM",
          price: 101.23,
          quantity: 5,
          date: "2025-06-01",
          action: "buy",
        },
      ],
    };

    await importData(customPayload);

    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "CUSTOM", action: "buy", quantity: 5 });
    expect(store[DATASET_SOURCE_KEY]).toBe(DATASET_SOURCE_CUSTOM);
  });

  test("clearAndImportData seeds builtin dataset", async () => {
    const store: Record<string, string> = {};
    setupLocalStorage(store);

    const builtinData: Parameters<typeof clearAndImportData>[0] = {
      positions: [],
      trades: [
        {
          date: "2025-04-01",
          symbol: "SAMPLE",
          side: "BUY" as const,
          qty: 3,
          price: 42,
        },
      ],
    };

    await clearAndImportData(builtinData);

    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "SAMPLE", action: "buy", quantity: 3 });
    expect(store[DATASET_SOURCE_KEY]).toBe(DATASET_SOURCE_BUILTIN);
  });
});
