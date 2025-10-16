import { computeGlobalMeta } from "../globalMeta";

describe("computeGlobalMeta", () => {
  const evaluationDay = "2025-01-02";

  const allSymbols = ["AAPL", "MSFT", "TSLA"];

  const hasLivePriceFor = (available: string[]) => (symbol: string) =>
    available.includes(symbol);
  const hasOfficialCloseFor = (available: string[]) => (day: string, symbol: string) =>
    day === evaluationDay && available.includes(symbol);

  it("returns live mode when all live prices are available during trading hours", async () => {
    const meta = await computeGlobalMeta({
      nowNY: new Date("2025-01-02T10:00:00-05:00"),
      evaluationDay,
      isTradingDay: true,
      beforeOfficialClose: true,
      relatedSymbols: allSymbols,
      hasLivePriceFor: hasLivePriceFor(allSymbols),
      hasOfficialCloseFor: hasOfficialCloseFor([]),
    });

    expect(meta.mode).toBe("live");
    expect(meta.degradedReason).toBeNull();
    expect(meta.latestPriceOk).toBe(true);
    expect(meta.officialCloseOk).toBe(false);
    expect(meta.missingPairs).toEqual([]);
  });

  it("returns degraded live when a live price is missing", async () => {
    const missing = allSymbols.slice(0, 2);
    const meta = await computeGlobalMeta({
      nowNY: new Date("2025-01-02T11:00:00-05:00"),
      evaluationDay,
      isTradingDay: true,
      beforeOfficialClose: true,
      relatedSymbols: allSymbols,
      hasLivePriceFor: hasLivePriceFor(missing),
      hasOfficialCloseFor: hasOfficialCloseFor(allSymbols),
    });

    expect(meta.mode).toBe("degraded");
    expect(meta.degradedReason).toBe("live-latest-missing");
    expect(meta.latestPriceOk).toBe(false);
    expect(meta.missingPairs).toEqual([
      { day: evaluationDay, symbol: "TSLA" },
    ]);
  });

  it("returns close mode after trading hours when official closes are ready", async () => {
    const meta = await computeGlobalMeta({
      nowNY: new Date("2025-01-02T17:00:00-05:00"),
      evaluationDay,
      isTradingDay: true,
      beforeOfficialClose: false,
      relatedSymbols: allSymbols,
      hasLivePriceFor: hasLivePriceFor([]),
      hasOfficialCloseFor: hasOfficialCloseFor(allSymbols),
    });

    expect(meta.mode).toBe("close");
    expect(meta.degradedReason).toBeNull();
    expect(meta.officialCloseOk).toBe(true);
    expect(meta.missingPairs).toEqual([]);
  });

  it("returns degraded close when an official close is missing", async () => {
    const meta = await computeGlobalMeta({
      nowNY: new Date("2025-01-02T17:00:00-05:00"),
      evaluationDay,
      isTradingDay: true,
      beforeOfficialClose: false,
      relatedSymbols: allSymbols,
      hasLivePriceFor: hasLivePriceFor(allSymbols),
      hasOfficialCloseFor: hasOfficialCloseFor(["AAPL"]),
    });

    expect(meta.mode).toBe("degraded");
    expect(meta.degradedReason).toBe("close-official-missing");
    expect(meta.officialCloseOk).toBe(false);
    expect(meta.missingPairs).toEqual([
      { day: evaluationDay, symbol: "MSFT" },
      { day: evaluationDay, symbol: "TSLA" },
    ]);
  });
});
