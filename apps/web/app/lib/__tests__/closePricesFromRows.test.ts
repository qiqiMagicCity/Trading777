import {
  closePricesFromRows,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
} from "../dailyResults";
import { isOfficialCloseSource } from "../../lib/priceSourceGuards";

describe("close price precedence", () => {
  it("prefers file closes over cached fallbacks", () => {
    const cachedRows = [
      { symbol: "AAPL", date: "2024-01-02", close: 90, source: "close_fallback" },
    ];
    const fileClosePrices = {
      AAPL: {
        "2024-01-02": 105,
      },
    };

    const fallbackCloses = closePricesFromRows(
      cachedRows.filter((row) => !isOfficialCloseSource(row.source)),
    );
    const officialCloses = closePricesFromRows(
      cachedRows.filter((row) => isOfficialCloseSource(row.source)),
    );

    const merged = mergeClosePriceMaps(
      fallbackCloses,
      normalizeClosePriceMap(fileClosePrices),
      officialCloses,
    );

    expect(fallbackCloses.AAPL["2024-01-02"]).toBe(90);
    expect(officialCloses.AAPL).toBeUndefined();
    expect(merged.AAPL["2024-01-02"]).toBe(105);
  });
});
