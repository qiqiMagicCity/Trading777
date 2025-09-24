import "fake-indexeddb/auto";
import {
  clearAndImportData,
  importData,
  getAnyTradeCount,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_BUILTIN,
  DATASET_HASH_KEY,
} from "@/lib/services/dataService";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";

const BUILTIN_DATASET = {
  positions: [],
  trades: [{ symbol: "SAMPLE", price: 42, qty: 3, side: "BUY", date: "2025-04-01" }],
};

describe("dataset guard + importer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("seeds builtin only on first run (no source + empty store)", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_BUILTIN);
    expect(localStorage.getItem(DATASET_HASH_KEY)).toBeTruthy();
  });

  it("does NOT reseed when source=custom", async () => {
    const custom = {
      positions: [],
      trades: [
        { symbol: "TSDD", price: 11.04, quantity: 10000, date: "2025-05-23", action: "buy", time: "2025-05-23T05:18:31" },
        { symbol: "BA", price: 216.27, quantity: 350, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:03" },
      ],
    };
    await importData(custom as any);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);

    const orig = (global as any).fetch;
    if (!orig) (global as any).fetch = async () => ({ ok: true, json: async () => ({}) }) as any;
    const spy = jest.spyOn(global as any, "fetch");

    await ensureBuiltInDatasetLoaded();

    expect(spy).not.toHaveBeenCalledWith(expect.stringMatching(/trades\\.json|\\/data\\/builtin/));
    spy.mockRestore();
    if (!orig) delete (global as any).fetch;
  });

  it("keeps custom data count after bootstrap", async () => {
    const custom = {
      positions: [],
      trades: [{ symbol: "XYZ", price: 1, quantity: 1, date: "2025-01-01", action: "buy" }],
    };
    await importData(custom as any);
    await ensureBuiltInDatasetLoaded();
    expect(await getAnyTradeCount()).toBe(1);
  });
});
