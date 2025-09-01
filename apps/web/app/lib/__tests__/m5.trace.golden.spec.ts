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

test("黄金案例：M5 拆分与总值正确", () => {
  const res = runAll(
    "2025-08-01",
    positions as any,
    trades as any,
    prices as any,
    { dailyResults: daily as any },
    { evalDate: "2025-08-01" },
  );
  const m = normalizeMetrics(res);
  expect(m.M5.behavior).toBe(1670);
  expect(m.M5.fifo).toBe(1320);
  expect(m.M4.total).toBe(6530);
  expect(m.M6.total).toBe(8952.5);

  const rows = res.aux.breakdown;
  // NFLX 09:40 SELL 120 => 100历史(M4) + 20当日(M5)
  expect(rows.some((r:any)=> r.symbol==='NFLX' && r.time.includes('09:40') && r.into==='M4'   && r.qty===100)).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='NFLX' && r.time.includes('09:40') && r.into==='M5.2' && r.qty===20 )).toBe(true);
  // TSLA：09:38 50→M4；09:45 100→M5；11:30 50→M5
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('09:38') && r.into==='M4'   && r.qty===50 )).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('09:45') && r.into==='M5.2' && r.qty===100)).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('11:30') && r.into==='M5.2' && r.qty===50 )).toBe(true);
  // AAPL 当日合计 150 全入 M5
  expect(rows.filter((r:any)=> r.symbol==='AAPL' && r.into==='M5.2').reduce((s:any,x:any)=>s+x.qty,0)).toBe(150);
  // MSFT：14:00 卖出30（M5），16:00 回补60（M5）
  expect(rows.some((r:any)=> r.symbol==='MSFT' && r.time.includes('14:00') && r.into==='M5.2' && r.qty===30)).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='MSFT' && r.time.includes('16:00') && r.into==='M5.2' && r.qty===60)).toBe(true);
  // GOOGL：11:00 回补20 + 13:00 回补20 → M5 40
  expect(rows.filter((r:any)=> r.symbol==='GOOGL' && r.into==='M5.2').reduce((s:any,x:any)=>s+x.qty,0)).toBe(40);
});
