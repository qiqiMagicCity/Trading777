import "fake-indexeddb/auto";

jest.mock("@/app/lib/prices/officialCloseFacade", () => ({
  refreshOfficialCloseMaps: jest.fn().mockResolvedValue(1),
}));

jest.mock("@/app/lib/prices/ready", () => ({
  markPricesReady: jest.fn(),
}));
import {
  cleanupMisplacedPriceEntries,
  closeDb,
  getAllPrices,
  importClosePrices,
  putPrice,
} from "@/lib/services/dataService";

describe("importClosePrices", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    originalFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await closeDb();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete (global as any).fetch;
    }
  });

  test("supports symbol-first and date-first nested maps", async () => {
    const symbolFirst = {
      AMD: { "2025-10-03": 123.45 },
      BA: { "2025-09-19": 200.01 },
    } satisfies Record<string, Record<string, number>>;

    const dateFirst = {
      "2025-10-03": { AMZN: 111.11 },
      "2025-09-19": { DIS: 88.77 },
    } satisfies Record<string, Record<string, number>>;

    await importClosePrices(symbolFirst);
    await importClosePrices(dateFirst);

    const prices = await getAllPrices();
    expect(prices).toHaveLength(4);
    prices.forEach((p) => {
      expect(p.symbol).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof p.close).toBe("number");
      expect(p.source).toBe("official/import");
    });
    expect(prices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "AMD", date: "2025-10-03", close: 123.45 }),
        expect.objectContaining({ symbol: "BA", date: "2025-09-19", close: 200.01 }),
        expect.objectContaining({ symbol: "AMZN", date: "2025-10-03", close: 111.11 }),
        expect.objectContaining({ symbol: "DIS", date: "2025-09-19", close: 88.77 }),
      ]),
    );
  });

  test("cleanup removes misplaced symbol/date entries", async () => {
    await putPrice({ symbol: "2025-09-19", date: "AMD", close: 101, source: "official/import" });
    await putPrice({ symbol: "UAL", date: "UAL", close: 88.8, source: "official/import" });
    await putPrice({ symbol: "AMD", date: "2025-09-19", close: 99.9, source: "official/import" });

    const removed = await cleanupMisplacedPriceEntries();
    expect(removed).toBe(2);

    const remaining = await getAllPrices();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      symbol: "AMD",
      date: "2025-09-19",
      close: 99.9,
      source: "official/import",
    });
  });
});
