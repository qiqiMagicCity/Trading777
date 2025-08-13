import * as fs from 'node:fs';
import * as path from 'node:path';
import { runAll } from '../apps/web/app/lib/runAll';

type Pos = { sym:string; side:'LONG'|'SHORT'; qty:number; price?:number; cost?:number };
const fx=(f:string)=>JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures',f),'utf8'));
const n2=(x:number)=>Math.round(x*100)/100;

test('Rolling baseline (7/31 -> 8/01)：今日优先 + 滚动历史', () => {
  const hist:Pos[]=[
    {sym:'TSLA',side:'LONG',qty:50,price:290},
    {sym:'NFLX',side:'LONG',qty:100,price:1100},
    {sym:'AMZN',side:'SHORT',qty:80,price:220}
  ];
  const t0731=fx('2025-07-31.trades.json'); const p0731=fx('2025-07-31.prices.json');
  const D1=runAll(hist,t0731,p0731);
  expect(n2(D1.M4.total + D1.M5.fifoRealized)).toBe(600.00);
  expect(n2(D1.M3.total)).toBe(0.00);

  const t0801=fx('2025-08-01.trades.json'); const p0801=fx('2025-08-01.prices.json');
  const D2=runAll(D1.openLots,t0801,p0801);

  expect(n2(D2.M4.total)).toBe(4030.00);
  expect(n2(D2.M5.fifoRealized)).toBe(1670.00);
  expect(n2(D2.M3.total)).toBe(3871.50);
  expect(n2(D2.M6.total)).toBe(9571.50);

  const M9  = n2((D1.M4.total + D1.M5.fifoRealized) + (D2.M4.total + D2.M5.fifoRealized));
  const WTD = n2((D1.M4.total + D1.M5.fifoRealized + D1.M3.total) + (D2.M4.total + D2.M5.fifoRealized + D2.M3.total));
  const MTD = n2(D2.M4.total + D2.M5.fifoRealized + D2.M3.total);

  expect(M9).toBe(6300.00);
  expect(WTD).toBe(10171.50);
  expect(MTD).toBe(9571.50);

  expect(n2(D2.invariants.m1Recalc)).toBe(n2(D2.M1.total));
  expect(D2.invariants.closedQtyConsistency).toBe(true);
  expect(Math.abs(D2.invariants.realizedConsistencyDiff)).toBeLessThan(1e-6);
});

