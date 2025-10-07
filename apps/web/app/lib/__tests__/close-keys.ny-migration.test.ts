import {
  migrateClosePriceMap,
  hasClosePriceMigrationRun,
  __resetClosePriceMigrationFlagForTest,
} from "@/app/lib/closePriceMigration";

describe("close price key migration", () => {
  beforeEach(() => {
    __resetClosePriceMigrationFlagForTest();
  });

  it("normalizes UTC buckets and prioritizes NY keys", () => {
    const raw = {
      AAPL: {
        "2025-09-30T00:00:00.000Z": 150.12,
        "2025-09-30": 151.23,
      },
      "2025-09-30T00:00:00.000Z": {
        aapl: 149.87,
        msft: 302.5,
      },
      MSFT: {
        "2025-09-29T23:59:59Z": "298.44",
      },
    } as Record<string, unknown>;

    const { map, stats } = migrateClosePriceMap(raw);

    expect(map.AAPL["2025-09-30"]).toBeCloseTo(151.23);
    expect(map.MSFT["2025-09-29"]).toBeCloseTo(298.44);
    expect(stats.convertedUtcKeys).toBeGreaterThan(0);
    expect(stats.detectedDateBuckets).toBeGreaterThan(0);
    expect(stats.mutated).toBe(true);
    expect(hasClosePriceMigrationRun()).toBe(true);
  });
});
