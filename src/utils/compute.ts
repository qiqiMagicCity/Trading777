import type { Trade } from '../types';

export interface KPI {
  positionCost: number;
  intradayRealized: number;
  intradayUnreal: number;
  dayTrades: number;
  totalTrades: number;
  wtdPnl: number;
  mtdPnl: number;
  ytdPnl: number;
}

export function computeKPIs(trades: Trade[], quotes: Record<string,{c:number,pc:number}>): KPI {
  const today = new Date().toISOString().slice(0,10);
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(),0,1);

  let positionCost = 0;
  let intradayRealized = 0;
  let dayTrades = 0;
  let totalTrades = trades.length;

  const posMap: Record<string, number> = {};

  trades.forEach(t=>{
    const qtySigned = (t.action==='BUY'||t.action==='COVER')? t.quantity : -t.quantity;
    posMap[t.symbol] = (posMap[t.symbol]||0)+ qtySigned;

    if(t.trade_at.slice(0,10)===today){
      dayTrades +=1;
    }
  });

  // position cost
  for(const sym in posMap){
    const qty = posMap[sym];
    const absQty = Math.abs(qty);
    const avgCost = avgCostOfSymbol(trades, sym);
    positionCost += absQty * avgCost;
  let wtdPnl = 0, mtdPnl = 0, ytdPnl = 0;
  trades.forEach(t=>{
    const d = new Date(t.trade_at);
    const realized = (t.action==='SELL'||t.action==='SHORT')? t.quantity*t.price*-1 : t.quantity*t.price;
    if(d>=monday) wtdPnl += realized;
    if(d>=monthStart) mtdPnl += realized;
    if(d>=yearStart) ytdPnl += realized;
  });

  }

  // intraday realized simplistic
  const symGrouped: Record<string, {buyQty:number,buyAmt:number,sellQty:number,sellAmt:number}> = {};
  trades.filter(t=>t.trade_at.slice(0,10)===today).forEach(t=>{
    const g = symGrouped[t.symbol] ?? {buyQty:0,buyAmt:0,sellQty:0,sellAmt:0};
    if(t.action==='BUY'){
      g.buyQty += t.quantity; g.buyAmt += t.quantity*t.price;
    } else if(t.action==='SELL'){
      g.sellQty += t.quantity; g.sellAmt += t.quantity*t.price;
    } else if(t.action==='SHORT'){
      g.sellQty += t.quantity; g.sellAmt += t.quantity*t.price;
    } else if(t.action==='COVER'){
      g.buyQty += t.quantity; g.buyAmt += t.quantity*t.price;
    }
    symGrouped[t.symbol]=g;
  });
  for(const s in symGrouped){
    const g = symGrouped[s];
    const matchQty = Math.min(g.buyQty, g.sellQty);
    if(matchQty>0){
      const buyAvg = g.buyAmt / g.buyQty;
      const sellAvg = g.sellAmt / g.sellQty;
      intradayRealized += (sellAvg - buyAvg)*matchQty;
    }
  }

  // intraday unreal
  let intradayUnreal = 0;
  for(const sym in posMap){
    const q = posMap[sym];
    const qAbs = Math.abs(q);
    const quote = quotes[sym];
    if(!quote) continue;
    const diff = quote.c - quote.pc;
    intradayUnreal += diff * qAbs * (q>=0?1:-1);
  }

  // TODO wtd/mtd/ytd realized (placeholder 0)

  return {positionCost,intradayRealized,intradayUnreal,dayTrades,totalTrades,
          wtdPnl:wtdPnl,mtdPnl:mtdPnl,ytdPnl:ytdPnl};
}

function avgCostOfSymbol(trades: Trade[], symbol: string): number{
  let qty=0, amt=0;
  trades.forEach(t=>{
    if(t.symbol!==symbol) return;
    if(t.action==='BUY'||t.action==='COVER'){ qty+=t.quantity; amt+=t.quantity*t.price;}
    else{ qty-=t.quantity; amt-=t.quantity*t.price;}
  });
  return qty!==0? Math.abs(amt/qty):0;
}
