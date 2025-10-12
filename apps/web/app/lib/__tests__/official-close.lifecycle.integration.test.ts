import { calcMetrics, normalizeMetrics } from "@/app/lib/metrics";
import type { Position } from "@/lib/services/dataService";

describe("official close diagnostics lifecycle", () => {
  const baseEvalDate = "2024-09-24";
  const prevDate = "2024-09-23";
  let inWindow = true;

  beforeAll(() => {
    jest
      .spyOn(require("@/app/lib/marketHours"), "evaluateCloseWindow")
      .mockImplementation((date: string) => ({
        date,
        isTradingDay: true,
        requireOfficialClose: !inWindow,
        graceMinutes: 0,
        windowEndTs: inWindow ? Date.now() + 60000 : Date.now() - 60000,
        nowTs: Date.now(),
        inWindow,
      }));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const basePosition: Position = {
    symbol: "MISS",
    qty: 10,
    avgPrice: 100,
    last: 105,
    priceOk: true,
    prevClose: 100,
  } as any;

  it("records pending during the close window, escalates after, and clears once filled", () => {
    const positions = [basePosition];

    const runMetrics = (officialCloseMap: Record<string, Record<string, number>>) =>
      normalizeMetrics(
        calcMetrics([], positions as any, [], {
          periodEvalYmd: baseEvalDate,
          tradingDateStr: baseEvalDate,
          officialCloseMap,
        }),
      );

    // Stage 1: within the grace window -> pending only
    inWindow = true;
    const pendingState = runMetrics({});
    expect(pendingState.diagnostics?.pendingOfficialCloses).toHaveLength(1);
    expect(pendingState.diagnostics?.missingOfficialCloses).toBeUndefined();
    expect(pendingState._m6?.mtmOvernight).toBe(0);
    expect(pendingState.M4_today.degraded).toBe(true);

    const pendingEntry = pendingState.diagnostics?.pendingOfficialCloses?.[0];
    expect(pendingEntry).toMatchObject({
      symbol: "MISS",
      date: prevDate,
      hasFallback: true,
      impact: expect.arrayContaining(["M6过夜桶=0"]),
    });

    // Stage 2: after window -> yellow alert
    inWindow = false;
    const missingState = runMetrics({});
    expect(missingState.diagnostics?.pendingOfficialCloses).toBeUndefined();
    const missing = missingState.diagnostics?.missingOfficialCloses ?? [];
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      symbol: "MISS",
      date: prevDate,
      impact: ["M4今日退化（过夜=0）", "M6过夜桶=0"],
      purposes: ["M6"],
      hasFallback: true,
    });
    expect(missingState._m6?.mtmOvernight).toBe(0);
    expect(missingState.M4_today.degraded).toBe(true);

    // Stage 3: price filled -> diagnostics cleared and overnight restored
    const resolvedState = runMetrics({ MISS: { [prevDate]: 100 } });
    expect(resolvedState.diagnostics?.pendingOfficialCloses).toBeUndefined();
    expect(resolvedState.diagnostics?.missingOfficialCloses).toBeUndefined();
    expect(resolvedState._m6?.mtmOvernight).toBeCloseTo(50, 6);
    expect(resolvedState.M4_today.degraded).toBe(false);
    expect(resolvedState.M4_today.total).toBeCloseTo(
      resolvedState._m6!.realizedToday + resolvedState._m6!.mtmOvernight,
      6,
    );
  });
});
