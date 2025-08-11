export type HistPos = { sym:string; side:'LONG'|'SHORT'; qty:number; price?:number; cost?:number };
export type Trade   = { t:string; sym:string; type:'BUY'|'SELL'|'SHORT'|'COVER'; qty:number; price:number };

type Lot  = { qty:number; cost:number };
type Book = Map<string, Lot[]>;
const r2=(x:number)=>Math.round((x+1e-9)*100)/100;

function push(b:Book,s:string,l:Lot){const a=b.get(s)||[];a.push({qty:l.qty,cost:l.cost});b.set(s,a);}
function popFIFO(b:Book,s:string,n:number){
  const a=b.get(s) || [];
  const out:Lot[] = [];
  let left = n;
  while (left > 0 && a.length) {
    const f = a[0]!;
    const take = Math.min(left, f.qty);
    out.push({ qty: take, cost: f.cost });
    f.qty -= take;
    left -= take;
    if (f.qty === 0) a.shift();
  }
  if (left > 0) throw new Error(`FIFO 不足: ${s}, need ${left}`);
  b.set(s, a);
  return out;
}

export function runAll(
  hist: HistPos[], trades: Trade[], prices: Record<string, number>
): {
  M1:{total:number}; M2:{total:number}; M3:{total:number};
  M4:{total:number};
  M5:{behavior:number; fifoRealized:number};
  M6:{total:number};
  M10:{winRate:number};
  openLots: Array<{ sym:string; side:'LONG'|'SHORT'; qty:number; cost:number }>;
  invariants: { m1Recalc:number; closedQtyConsistency:boolean; realizedConsistencyDiff:number };
}{
  const Hlong:Book=new Map(), Hshort:Book=new Map();
  const Tlong:Book=new Map(), Tshort:Book=new Map();
  const Bstk:Book=new Map(),  Sstk:Book=new Map();

  // 历史期初批次
  for(const h of hist){
    const lot={qty:h.qty, cost:(typeof h.price==='number'?h.price:(h.cost??0))};
    (h.side==='LONG'?Hlong:Hshort).set(h.sym,[...((h.side==='LONG'?Hlong:Hshort).get(h.sym)||[]),lot]);
  }

  let M4=0,M51=0,M52=0; const realized:number[]=[];
  let closedByBehavior=0, closedByTodayFifo=0;

  for(const tr of trades){
    const {sym,type,qty,price:px}=tr;
    if(type==='BUY'){ push(Tlong,sym,{qty,cost:px}); push(Bstk,sym,{qty,cost:px}); }
    else if(type==='SHORT'){ push(Tshort,sym,{qty,cost:px}); push(Sstk,sym,{qty,cost:px}); }
    else if(type==='SELL'){
      // 当日优先闭环 → 计入 M5.1/M5.2
      let left=qty; const bs=Bstk.get(sym)||[];
      while(left>0 && bs.length){
        const top=bs[0]; const take=Math.min(left,top.qty);
        M51+=(px-top.cost)*take;
        for(const lot of popFIFO(Tlong,sym,take)){ const pnl=(px-lot.cost)*lot.qty; M52+=pnl; realized.push(pnl); }
        closedByBehavior+=take; closedByTodayFifo+=take;
        top.qty-=take; left-=take; if(top.qty===0) bs.shift();
      }
      Bstk.set(sym,bs);
      // 余量吃历史 FIFO → 计入 M4
      if(left>0){ for(const lot of popFIFO(Hlong,sym,left)){ const pnl=(px-lot.cost)*lot.qty; M4+=pnl; realized.push(pnl);} }
    }
    else if(type==='COVER'){
      let left=qty; const ss=Sstk.get(sym)||[];
      while(left>0 && ss.length){
        const top=ss[0]; const take=Math.min(left,top.qty);
        M51+=(top.cost-px)*take;
        for(const lot of popFIFO(Tshort,sym,take)){ const pnl=(lot.cost-px)*lot.qty; M52+=pnl; realized.push(pnl); }
        closedByBehavior+=take; closedByTodayFifo+=take;
        top.qty-=take; left-=take; if(top.qty===0) ss.shift();
      }
      Sstk.set(sym,ss);
      if(left>0){ for(const lot of popFIFO(Hshort,sym,left)){ const pnl=(lot.cost-px)*lot.qty; M4+=pnl; realized.push(pnl);} }
    }
  }

  // 期末 open lots = 历史剩余 + 当日剩余
  const openLots:Array<{sym:string; side:'LONG'|'SHORT'; qty:number; cost:number}>=[];
  const dump=(book:Book,side:'LONG'|'SHORT')=>{
    for(const [sym,qs] of book){ for(const lot of qs){ if(lot.qty>0) openLots.push({sym,side,qty:lot.qty,cost:lot.cost}); } }
  };
  dump(Hlong,'LONG'); dump(Tlong,'LONG'); dump(Hshort,'SHORT'); dump(Tshort,'SHORT');

  // M1/M2/M3
  let M1v=0,M2v=0,M3v=0;
  for(const o of openLots){
    const p=prices[o.sym]??0;
    M1v+=o.qty*o.cost; M2v+=o.qty*p;
    M3v+= o.side==='LONG' ? (p-o.cost)*o.qty : (o.cost-p)*o.qty;
  }

  // 胜率
  const wins=realized.filter(v=>v>0).length, losses=realized.filter(v=>v<0).length;
  const winRate = wins+losses>0 ? Math.round((wins/(wins+losses)*100)*10)/10 : 0;

  // 不变量
  const m1Recalc=openLots.reduce((s,x)=>s+Math.abs(x.qty)*x.cost,0);
  const closedQtyConsistency = closedByBehavior===closedByTodayFifo;
  const realizedConsistencyDiff = Math.abs(realized.reduce((s,v)=>s+v,0)-(M4+M52));

  return {
    M1:{total:r2(M1v)}, M2:{total:r2(M2v)}, M3:{total:r2(M3v)},
    M4:{total:r2(M4)}, M5:{behavior:r2(M51), fifoRealized:r2(M52)},
    M6:{total:r2(M4+M52+M3v)}, M10:{winRate},
    openLots,
    invariants:{ m1Recalc:r2(m1Recalc), closedQtyConsistency, realizedConsistencyDiff }
  };
}
export default runAll;
