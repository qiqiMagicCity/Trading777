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
  expect(m.M6.total).toBe(8952.5);
});
