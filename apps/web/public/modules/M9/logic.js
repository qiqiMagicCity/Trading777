import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';
import { buildFIFO } from '../../utils/fifo.js';

class M9Logic extends ModuleBase{
  constructor(){ super('M9'); this.calc(); }
  async calc(){
    const trades = await getTrades();
    const todayStr=new Date().toISOString().slice(0,10);
    const histTrades = trades.filter(t=> t.date && !t.date.startsWith(todayStr)); // before today
    let realized=0;
    const fifoMap={};
    histTrades.forEach(t=>{
      const {symbol,type,qty,price,date}=t;
      if(!fifoMap[symbol]) fifoMap[symbol]={long:[],short:[]};
      const s=fifoMap[symbol];
      if(type==='BUY') s.long.push({qty,price});
      else if(type==='SELL'){
        let remain=qty;
        while(remain>0 && s.long.length){
          const b=s.long[0];
          const q=Math.min(b.qty,remain);
          realized += (price - b.price)*q;
          b.qty-=q; remain-=q;
          if(b.qty===0) s.long.shift();
        }
      }else if(type==='SHORT') s.short.push({qty,price});
      else if(type==='COVER'){
        let remain=qty;
        while(remain>0 && s.short.length){
          const b=s.short[0];
          const q=Math.min(b.qty,remain);
          realized += (b.price - price)*q;
          b.qty-=q; remain-=q;
          if(b.qty===0) s.short.shift();
        }
      }
    });
    this.publish({value:realized});
  }
}
window['M9Logic']=new M9Logic();
export default window['M9Logic'];