import { calcMetrics } from "@/app/lib/metrics";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";

describe("calcMetrics price fallback", () => {
  it("uses prevClose or trade fallback when realtime marks are missing", () => {
    const trades: EnrichedTrade[] = [] as any;
    const positions: Position[] = [
      {
        symbol: "AAA",
        qty: 10,
        avgPrice: 10,
        last: 11,
        priceOk: false,
        stale: true,
        prevClose: 11,
      },
      {
        symbol: "BBB",
        qty: 5,
        avgPrice: 20,
        last: 20,
        priceOk: false,
        stale: true,
      },
    ];

    const metrics = calcMetrics(trades, positions, []);

    expect(metrics.M1).toBeCloseTo(200);
    expect(metrics.M2).toBeCloseTo(210);
    expect(metrics.M3).toBeCloseTo(10);
    expect(metrics.M6).toBeCloseTo(0);
    expect(metrics.aux?.markWarning).toBe("PRICE_FALLBACK");
    expect(metrics.aux?.staleMarks).toBe(true);
    expect(metrics.aux?.markFallbackSymbols).toEqual(expect.arrayContaining(["AAA", "BBB"]));
    expect(metrics.aux?.m6Excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "BBB", reason: "MISSING_PREV_CLOSE" }),
      ]),
    );
  });
});
