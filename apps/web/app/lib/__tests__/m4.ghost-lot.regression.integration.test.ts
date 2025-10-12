import { calcMetrics } from "../metrics";
import { runAll, type RawTrade } from "../runAll";
import type { InitialPosition } from "../fifo";
import { round2 } from "../money";

describe("M4 ghost-lot regression (seedInitialLots vs double-push)", () => {
  const FREEZE_KEY = "NEXT_PUBLIC_FREEZE_DATE";

  test("historical first, then intraday round-trip -> M4 counts history only", async () => {
    const evalDateStr = "2025-10-06";
    const prevFreeze = process.env[FREEZE_KEY];
    process.env[FREEZE_KEY] = evalDateStr;

    try {
      const tradesForCalc = [
        {
          symbol: "ZZZ",
          action: "buy",
          quantity: 100,
          price: 10,
          date: "2025-10-05T09:30:00-04:00",
          isInitialPosition: true,
        },
        {
          symbol: "ZZZ",
          action: "sell",
          quantity: 100,
          price: 11,
          date: "2025-10-06T09:30:00-04:00",
        },
        {
          symbol: "ZZZ",
          action: "buy",
          quantity: 10,
          price: 12,
          date: "2025-10-06T10:00:00-04:00",
        },
        {
          symbol: "ZZZ",
          action: "sell",
          quantity: 10,
          price: 12.5,
          date: "2025-10-06T10:30:00-04:00",
        },
      ];

      const calcResult: any = calcMetrics(tradesForCalc as any, [], [], {
        tradingDateStr: evalDateStr,
        periodEvalYmd: evalDateStr,
      });
      expect(round2(calcResult.M4)).toBe(100);

      const initialPositions: InitialPosition[] = [
        { symbol: "ZZZ", qty: 100, avgPrice: 10 },
      ];
      const trades: RawTrade[] = [
        {
          symbol: "ZZZ",
          side: "SELL",
          qty: 100,
          price: 11,
          date: "2025-10-06T09:30:00-04:00",
        },
        {
          symbol: "ZZZ",
          side: "BUY",
          qty: 10,
          price: 12,
          date: "2025-10-06T10:00:00-04:00",
        },
        {
          symbol: "ZZZ",
          side: "SELL",
          qty: 10,
          price: 12.5,
          date: "2025-10-06T10:30:00-04:00",
        },
      ];

      const runAllResult: any = await runAll(
        evalDateStr,
        initialPositions,
        trades,
        {},
        {},
        { evalDate: evalDateStr }
      );

      expect(round2(runAllResult.M4)).toBe(100);
      expect(round2(calcResult.M4)).toBe(round2(runAllResult.M4));

      const legs = runAllResult.aux?.breakdown?.m4 ?? [];
      const everyHistory = legs.every((leg: any) => leg?.from === "history");
      expect(everyHistory).toBe(true);
    } finally {
      if (prevFreeze === undefined) {
        delete process.env[FREEZE_KEY];
      } else {
        process.env[FREEZE_KEY] = prevFreeze;
      }
    }
  });
});
