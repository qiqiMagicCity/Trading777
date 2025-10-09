import "fake-indexeddb/auto";

jest.mock("@/app/lib/prices/officialCloseFacade", () => ({
  refreshOfficialCloseMaps: jest.fn().mockResolvedValue(1),
}));

jest.mock("@/app/lib/prices/ready", () => ({
  markPricesReady: jest.fn(),
}));

import {
  closeDb,
  getPrice,
  importClosePrices,
  isOfficialCloseSource,
  putPrice,
} from "@/lib/services/dataService";

describe("official close source persistence", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
  });

  afterEach(async () => {
    await closeDb();
  });

  it("overwrites fallback entries with official/import source", async () => {
    await putPrice({
      symbol: "AAPL",
      date: "2024-06-01",
      close: 101,
      source: "close_fallback",
    });

    await importClosePrices({
      AAPL: {
        "2024-06-01": 150.25,
      },
    });

    const stored = await getPrice("AAPL", "2024-06-01");
    expect(stored).toEqual(
      expect.objectContaining({
        symbol: "AAPL",
        date: "2024-06-01",
        close: 150.25,
        source: "official/import",
      }),
    );
    expect(isOfficialCloseSource(stored?.source)).toBe(true);
  });
});
