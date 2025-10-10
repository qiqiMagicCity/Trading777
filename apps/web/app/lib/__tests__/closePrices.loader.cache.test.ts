import { loadJson } from "@/app/lib/dataSource";

describe("loadJson close_prices caching", () => {
  const store = new Map<string, string>();
  let originalFetch: typeof fetch | undefined;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    store.clear();
    originalFetch = global.fetch;
    originalLocalStorage = (global as any).localStorage;
    (global as any).localStorage = {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
      clear: jest.fn(() => {
        store.clear();
      }),
      key: jest.fn(),
      length: 0,
    } as unknown as Storage;
  });

  afterEach(() => {
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
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("appends version query and disables cache for close_prices", async () => {
    store.set("close_prices_version", "1700000000000");
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        AAPL: { "2025-01-02": 123.45 },
      }),
    });
    global.fetch = fetchMock as any;

    const result = await loadJson("close_prices");

    expect(fetchMock).toHaveBeenCalledWith(
      "/close_prices.json?v=1700000000000",
      { cache: "no-store" },
    );
    expect(result).toEqual({ "2025-01-02": { AAPL: 123.45 } });
  });

  it("uses updated version after import bump", async () => {
    store.set("close_prices_version", "1000");
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          AAPL: { "2025-01-02": 120 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          AAPL: { "2025-01-03": 130 },
        }),
      });
    global.fetch = fetchMock as any;

    const first = await loadJson("close_prices");
    expect(first).toEqual({ "2025-01-02": { AAPL: 120 } });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/close_prices.json?v=1000",
      { cache: "no-store" },
    );

    store.set("close_prices_version", "2000");

    const second = await loadJson("close_prices");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/close_prices.json?v=2000",
      { cache: "no-store" },
    );
    expect(second).toEqual({ "2025-01-03": { AAPL: 130 } });
  });
});
