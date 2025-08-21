import { realizedPnLLong, realizedPnLShort, round2 } from '../app/lib/money';

const eq = (a:number,b:number,msg:string) => { if (Math.abs(a-b)>1e-6) throw new Error(`${msg}: ${a} != ${b}`); };

(() => {
  // 来自你的黄金案例中的一些关键拆分：
  // TSLA 历史多头 50@290 在 301 卖出
  eq(realizedPnLLong(301,290,50), 550, 'TSLA hist long');

  // NFLX 历史多头 100@1100 在 1155 卖出
  eq(realizedPnLLong(1155,1100,100), 5500, 'NFLX hist long');

  // AMZN 历史空头 80@220 在 214 回补
  eq(realizedPnLShort(220,214,80), 480, 'AMZN hist short');

  console.log('money layer verified ✅');
})();
