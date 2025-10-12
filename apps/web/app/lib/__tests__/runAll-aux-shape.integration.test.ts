import type { InitialPosition } from "../fifo";
import { runAll, type RawTrade } from "../runAll";

async function runBaseline() {
  const evalISO = "2024-01-02";
  const evalDate = new Date(`${evalISO}T16:00:00-05:00`);
  const positions: InitialPosition[] = [
    { symbol: "AAPL", qty: 100, avgPrice: 10 },
  ];
  const trades: RawTrade[] = [];
  const close = { AAPL: { [evalISO]: 11 } };

  return runAll(
    evalISO,
    positions,
    trades,
    close,
    { dailyResults: [] },
    { evalDate },
  );
}

describe("runAll aux shape", () => {
  test("aux 里 'breakdown' 只出现一次", async () => {
    const r: any = await runBaseline();

    const assertShape = (res: any) => {
      const keys = Object.keys(res?.aux || {});
      const cnt = keys.filter((k) => k === "breakdown").length;
      expect(cnt).toBe(1);
      const legs = res?.aux?.breakdown?.m4;
      expect(legs).not.toBeUndefined();
    };

    if (r && typeof r === "object" && !Array.isArray(r)) {
      if (r.results && typeof r.results === "object") {
        for (const res of Object.values<any>(r.results)) {
          assertShape(res);
        }
        return;
      }
      assertShape(r);
    }
  });
});
