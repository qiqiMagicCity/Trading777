import { runAll } from "@/app/lib/runAll";
import trades from "./fixtures/2025-08-01.trades.json";
import prices from "./fixtures/closing-prices.json";

test("黄金案例逐笔拆解应符合文档", () => {
  const res = runAll({ trades, prices });

  // 关键聚合断言
  expect(res.M4.total).toBe(6530);
  expect(res.M5.behavior).toBe(1670); // 目标行为视角
  expect(res.M5.fifo).toBe(1320);
  expect(res.M6.total).toBe(8952.5);

  // 逐笔结构断言（数量方向，不校验顺序）
  const rows = res.aux.breakdown;

  // NFLX 09:40 SELL 120 => 100(历史→M4) + 20(当日→M5)
  expect(rows.some((r:any)=> r.symbol==='NFLX' && r.time.includes('09:40') && r.into==='M4'   && r.qty===100)).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='NFLX' && r.time.includes('09:40') && r.into==='M5.2' && r.qty===20 )).toBe(true);

  // TSLA：09:38 SELL 50 → 全历史 M4；09:45 SELL 100 → 当日 M5；11:30 SELL 50 → 当日 M5
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('09:38') && r.into==='M4'   && r.qty===50 )).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('09:45') && r.into==='M5.2' && r.qty===100)).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='TSLA' && r.time.includes('11:30') && r.into==='M5.2' && r.qty===50 )).toBe(true);

  // AAPL：14:30(50→M5) + 14:30(30→M5) + 15:00(70→M5) —— 全是当日
  expect(rows.filter((r:any)=> r.symbol==='AAPL' && r.into==='M5.2').reduce((s:any,r:any)=>s+r.qty,0)).toBe(150);

  // MSFT：14:00 SELL 30（多头 M5） + 16:00 COVER 60（空头 M5）
  expect(rows.some((r:any)=> r.symbol==='MSFT' && r.time.includes('14:00') && r.into==='M5.2' && r.qty===30 )).toBe(true);
  expect(rows.some((r:any)=> r.symbol==='MSFT' && r.time.includes('16:00') && r.into==='M5.2' && r.qty===60 )).toBe(true);

  // GOOGL：11:00 COVER 20（当日 M5） + 13:00 COVER 20（当日 M5）
  expect(rows.filter((r:any)=> r.symbol==='GOOGL' && r.into==='M5.2').reduce((s:any,r:any)=>s+r.qty,0)).toBe(40);
});
