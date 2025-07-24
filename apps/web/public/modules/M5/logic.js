import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';
import { buildFIFO } from '../../utils/fifo.js';

function isToday(ts){
  const d=new Date(ts);
  const now=new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
export function calcTodayPnL(trades){
  // simple realized PnL within today by matching BUY vs SELL pairs per symbol FIFO internal to today
  const map={};
  let pnl=0;
  trades.filter(isToday).forEach(t=>{
    const {symbol,type,qty,price}=t;
    if(!map[symbol]) map[symbol]=[];
    const stack=map[symbol];
    if(type==='BUY'){
      stack.push({qty,price});
    }else if(type==='SELL'){
      let remain=qty;
      while(remain>0 && stack.length){
        const batch=stack[0];
        const q=Math.min(batch.qty,remain);
        pnl += (price - batch.price)*q;
        batch.qty -= q;
        remain -= q;
        if(batch.qty===0) stack.shift();
      }
    }
  });
  return pnl;
}

class M5Logic extends ModuleBase{
  constructor(){ super('M5'); this.init(); }
  async init(){
    await this.calc();
    setInterval(()=>this.calc(),60000);
  }
  async calc(){
    const trades = await getTrades();
    // 视角1：当日买卖配对
    const pnl_trade = calcTodayPnL(trades);

    // 视角2：FIFO 成本视角（今日 SELL/COVER 针对历史仓计算）
    const fifo = buildFIFO(trades.filter(t=>!isToday(t.date))); // 昨天及之前建仓
    let pnl_fifo=0;
    trades.filter(t=>isToday(t.date)&&(t.type==='SELL'||t.type==='COVER')).forEach(t=>{
      const {symbol,qty,price,type}=t;
      const stacks = fifo[symbol] || {long:[],short:[]};
      let remain=qty;
      const list = (type==='SELL')? stacks.long : stacks.short;
      while(remain>0 && list.length){
        const batch=list[0];
        const q=Math.min(batch.qty,remain);
        pnl_fifo += (price - batch.price)*(type==='SELL'?1:-1)*q;
        batch.qty -= q; remain -= q;
        if(batch.qty===0) list.shift();
      }
    });
    this.publish({v1:pnl_trade,v2:pnl_fifo});
  }
}
window['M5Logic']=new M5Logic();
export default window['M5Logic'];