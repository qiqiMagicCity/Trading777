import "fake-indexeddb/auto";

import { closeDb, getPrice, importClosePrices, putPrice } from "@/lib/services/dataService";
import {
  closePricesFromRows,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
} from "@/app/lib/dailyResults";
import { overlayEntriesToMap } from "@/app/lib/officialCloseOverlayStore";
import * as dataSource from "@/app/lib/dataSource";
import { syncPackagedClosesToIdb } from "@/app/lib/prices/syncPackagedClosesToIdb";

jest.mock("@/app/lib/prices/officialCloseFacade", () => ({
  refreshOfficialCloseMaps: jest.fn().mockResolvedValue(99),
}));

jest.mock("@/app/lib/prices/ready", () => ({
  markPricesReady: jest.fn(),
}));

describe("official close consistency regression", () => {
  let originalFetch: typeof fetch | undefined;
  let originalLocalStorage: Storage | undefined;
  let storage: Map<string, string>;

  beforeEach(async () => {
    storage = new Map<string, string>();
    originalFetch = global.fetch;
    originalLocalStorage = (global as any).localStorage;
    (global as any).localStorage = {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        storage.delete(key);
      }),
      clear: jest.fn(() => storage.clear()),
      key: jest.fn(),
      length: 0,
    } as unknown as Storage;
    await indexedDB.deleteDatabase("TradingApp");
  });

  afterEach(async () => {
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
    if (originalLocalStorage) {
      (global as any).localStorage = originalLocalStorage;
    } else {
      delete (global as any).localStorage;
    }
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    await closeDb();
    jest.restoreAllMocks();
  });

  it("keeps overlay price ahead of packaged and cache and preserves sources", () => {
    const overlay = overlayEntriesToMap([
      {
        symbol: "AAPL",
        date: "2024-01-02",
        price: 111,
        tsCreated: Date.now(),
        tsUpdated: Date.now(),
        source: "official/import/overlay",
      },
    ]);
    const packaged = normalizeClosePriceMap(
      { AAPL: { "2024-01-02": 105 } },
      { defaultSource: "official/packaged" },
    );
    const cached = closePricesFromRows([
      { symbol: "AAPL", date: "2024-01-02", close: 90, source: "official/exchange" },
    ]);

    const merged = mergeClosePriceMaps(cached, packaged, overlay);

    expect(merged.AAPL?.["2024-01-02"]).toBe(111);
    expect(merged.AAPL?.__sources?.["2024-01-02"]).toBe("official/import/overlay");

    const imported = closePricesFromRows([
      { symbol: "AAPL", date: "2024-01-03", close: 222, source: "official/import/manual" },
    ]);
    const packagedConflict = normalizeClosePriceMap(
      { AAPL: { "2024-01-03": 10 } },
      { defaultSource: "official/packaged" },
    );
    const guarded = mergeClosePriceMaps(imported, packagedConflict);
    expect(guarded.AAPL?.["2024-01-03"]).toBe(222);
    expect(guarded.AAPL?.__sources?.["2024-01-03"]).toBe("official/import/manual");
  });

  it("refreshes version after each successful close_prices fetch", async () => {
    storage.set("close_prices_version", "seed");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ AAPL: { "2025-01-02": 100 } }),
        headers: { get: jest.fn((key: string) => (key === "etag" ? "etag-1" : null)) },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ AAPL: { "2025-01-03": 101 } }),
        headers: { get: jest.fn((key: string) => (key === "etag" ? "etag-2" : null)) },
      });
    global.fetch = fetchMock as any;

    const first = await dataSource.loadJson("close_prices");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/close_prices.json?v=seed", { cache: "no-store" });
    expect(first).toEqual({ AAPL: { "2025-01-02": 100 } });
    expect(storage.get("close_prices_version")).toBe("etag-1");

    const second = await dataSource.loadJson("close_prices");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/close_prices.json?v=etag-1", { cache: "no-store" });
    expect(second).toEqual({ AAPL: { "2025-01-03": 101 } });
    expect(storage.get("close_prices_version")).toBe("etag-2");
  });

  it("uses NEXT_PUBLIC_BASE_PATH when loading close prices", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/preview";
    storage.set("close_prices_version", "bp-test");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ TSLA: { "2025-01-02": 250 } }),
      headers: { get: jest.fn(() => "etag-bp") },
    });
    global.fetch = fetchMock as any;

    await dataSource.loadJson("close_prices");

    expect(fetchMock).toHaveBeenCalledWith("/preview/close_prices.json?v=bp-test", { cache: "no-store" });
    expect(storage.get("close_prices_version")).toBe("etag-bp");
  });

  it("retains official/import entries when syncing packaged closes", async () => {
    const loadSpy = jest.spyOn(dataSource, "loadJson").mockResolvedValue({
      AAPL: { "2024-01-02": 88 },
      MSFT: { "2024-01-02": 200 },
    } as any);

    await putPrice({ symbol: "AAPL", date: "2024-01-02", close: 150, source: "official/import" });

    await syncPackagedClosesToIdb();

    const aapl = await getPrice("AAPL", "2024-01-02");
    expect(aapl).toMatchObject({ close: 150, source: "official/import" });

    const msft = await getPrice("MSFT", "2024-01-02");
    expect(msft).toMatchObject({ close: 200, source: "official/packaged" });

    loadSpy.mockRestore();
  });

  it("writes back imports to the API and reports status", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as any;

    const result = await importClosePrices({ AAPL: { "2024-01-02": 123.45 } });

    expect(result.imported).toBe(1);
    expect(result.writeBackOk).toBe(true);
    expect(result.writeBackSkipped).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/close-price",
      expect.objectContaining({ method: "POST" }),
    );
    expect(storage.get("close_prices_version")).toBeDefined();
  });

  it("marks write-back failure while keeping local data active", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("offline"));
    global.fetch = fetchMock as any;

    const result = await importClosePrices({ NVDA: { "2024-01-02": 500 } });

    expect(result.imported).toBe(1);
    expect(result.writeBackOk).toBe(false);
    expect(result.writeBackSkipped).toBe(false);
    const stored = await getPrice("NVDA", "2024-01-02");
    expect(stored).toMatchObject({ close: 500, source: "official/import" });
  });
});
