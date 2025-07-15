import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';
import { getPrice } from '../../utils/priceService.js';
import { buildFIFO, getOpenPositions } from '../../utils/fifo.js';

class M3Logic extends ModuleBase {
  constructor(){ super('M3'); this.init(); }
  async init(){
    await this.calc();
    setInterval(()=>this.calc(), 60000);
  }
  async calc(){
    const trades = await getTrades();
    const fifoMap = buildFIFO(trades);
    const openPos = getOpenPositions(fifoMap);
    let total = 0;
    for(const p of openPos){
      const price = await getPrice(p.symbol);
      if(p.dir==='LONG'){
        total += (price - p.cost) * p.qty;
      }else{
        total += (p.cost - price) * p.qty;
      }
    }
    this.publish({value: total});
  }
}
window['M3Logic'] = new M3Logic();
export default window['M3Logic'];