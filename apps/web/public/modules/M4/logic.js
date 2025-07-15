import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';
import { buildFIFO } from '../../utils/fifo.js';

function isToday(ts){
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}

class M4Logic extends ModuleBase {
  constructor(){ super('M4'); this.calc(); }
  async calc(){
    const trades = await getTrades();
    const fifoMap = {};
    let realized = 0;
    const todayTrades = trades.filter(t=>isToday(t.date));
    for(const t of todayTrades){
      // For SELL/COVER, match against previous day positions
      if(t.type==='SELL' || t.type==='COVER'){
        const sym = t.symbol;
        if(!fifoMap[sym]) fifoMap[sym]=[];
        fifoMap[sym].push(t);
      }
    }
    // simplistic: treat each today SELL/COVER as realized vs FIFO cost (simulate)
    // Placeholder: zero
    realized = 0;
    this.publish({value: realized});
  }
}
window['M4Logic'] = new M4Logic();
export default window['M4Logic'];