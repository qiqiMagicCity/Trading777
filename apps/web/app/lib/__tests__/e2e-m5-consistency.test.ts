import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics } from "@/app/lib/metrics";
import fs from "node:fs";
import path from "node:path";

const trades = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/2025-08-01.trades.json"), "utf8"),
);
const prices = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/closing-prices.json"), "utf8"),
);
const positions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/initial_positions.json"), "utf8"),
);
const daily = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/dailyResult.json"), "utf8"),
);

test("页面口径与算法一致（黄金案例）", async () => {
  const res = await runAll(
    "2025-08-01",
    positions as any,
    trades as any,
    prices as any,
    { dailyResults: daily as any },
    { evalDate: "2025-08-01" },
  );
  const m = normalizeMetrics(res);
  expect(m.M5.behavior).toBe(1320);
  expect(m.M5.fifo).toBe(1320);
  expect(m.M4.total).toBe(6530);
  const prevRealized = m.aux?.m6PrevRealizedTotal ?? 0;
  const priceChange = m.aux?.m6PriceChange ?? 0;
  const legs = m.aux?.m6Legs ?? [];
  const legSum = legs.reduce((sum, leg) => sum + (leg?.mtm ?? 0), 0);
  expect(legs.every((leg) => leg.qty !== 0)).toBe(true);
  expect(legSum).toBeCloseTo(priceChange, 6);
  expect(priceChange).toBeCloseTo(m.M6.total - (m.M4.total + m.M5.fifo), 6);
  expect(priceChange).toBe(0);
  expect(m.M6.total).toBe(m.M4.total + m.M5.fifo);
  expect(m.M6.total).toBeCloseTo(prevRealized + m.M5.fifo + priceChange, 6);
  expect(m.aux?.m6Excluded?.map((row) => row.reason)).toEqual(
    expect.arrayContaining(["MISSING_PREV_CLOSE"]),
  );
});
