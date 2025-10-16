import { computeGlobalMeta } from "@/app/lib/mode/globalMeta";

describe("computeGlobalMeta wiring (v2)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_MODE_ENGINE_V2 = "1";
  });

  const evaluationDay = "2025-07-03"; // 假设半日市
  const relatedSymbols = ["AAPL", "MSFT", "TSLA"];

  function makeArgs(overrides: Partial<Parameters<typeof computeGlobalMeta>[0]> = {}) {
    const liveOk = new Set<string>(relatedSymbols);
    const officialOk = new Set<string>(relatedSymbols.map((symbol) => `${evaluationDay}:${symbol}`));
    const base = {
      nowNY: new Date("2025-07-03T10:30:00-04:00"),
      evaluationDay,
      isTradingDay: true,
      beforeOfficialClose: true,
      relatedSymbols,
      hasLivePriceFor: (symbol: string) => liveOk.has(symbol),
      hasOfficialCloseFor: (day: string, symbol: string) => officialOk.has(`${day}:${symbol}`),
    } satisfies Parameters<typeof computeGlobalMeta>[0];
    return Object.assign(base, overrides);
  }

  it("returns live mode when all live prices are available before close", async () => {
    const meta = await computeGlobalMeta(makeArgs());
    expect(meta.mode).toBe("live");
    expect(meta.latestPriceOk).toBe(true);
    expect(meta.missingPairs).toHaveLength(0);
  });

  it("flags degraded intraday when any live price is missing", async () => {
    const meta = await computeGlobalMeta(
      makeArgs({
        hasLivePriceFor: (symbol: string) => symbol !== "TSLA",
      }),
    );
    expect(meta.mode).toBe("degraded");
    expect(meta.degradedReason).toBe("live-latest-missing");
    expect(meta.missingPairs).toEqual([{ day: evaluationDay, symbol: "TSLA" }]);
  });

  it("falls back to close mode after market when official closes exist", async () => {
    const meta = await computeGlobalMeta(
      makeArgs({
        nowNY: new Date("2025-07-03T16:05:00-04:00"),
        beforeOfficialClose: false,
      }),
    );
    expect(meta.mode).toBe("close");
    expect(meta.officialCloseOk).toBe(true);
    expect(meta.missingPairs).toHaveLength(0);
  });

  it("marks degraded after close when official closes are missing", async () => {
    const meta = await computeGlobalMeta(
      makeArgs({
        nowNY: new Date("2025-07-03T16:05:00-04:00"),
        beforeOfficialClose: false,
        hasOfficialCloseFor: (day: string, symbol: string) => symbol === "AAPL" && day === evaluationDay,
      }),
    );
    expect(meta.mode).toBe("degraded");
    expect(meta.degradedReason).toBe("close-official-missing");
    expect(meta.missingPairs).toEqual([
      { day: evaluationDay, symbol: "MSFT" },
      { day: evaluationDay, symbol: "TSLA" },
    ]);
  });
});
