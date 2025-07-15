import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';

class M8Logic extends ModuleBase{
  constructor(){ super('M8'); this.calc(); }
  async calc(){
    const trades = await getTrades();
    const counts={B:0,S:0,P:0,C:0};
    trades.forEach(t=>{
      if(t.type==='BUY') counts.B++;
      else if(t.type==='SELL') counts.S++;
      else if(t.type==='SHORT') counts.P++;
      else if(t.type==='COVER') counts.C++;
    });
    const total=counts.B+counts.S+counts.P+counts.C;
    this.publish({counts,total});
  }
}
window['M8Logic']=new M8Logic();
export default window['M8Logic'];