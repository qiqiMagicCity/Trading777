import ModuleBase from '../ModuleBase.js';
import { getTrades } from '../../utils/dataStore.js';
function isToday(ts){
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
}
class M7Logic extends ModuleBase{
  constructor(){ super('M7'); this.calc(); }
  async calc(){
    const trades = await getTrades();
    const today = trades.filter(t=>isToday(t.date));
    const counts ={B:0,S:0,P:0,C:0};
    today.forEach(t=>{
      if(t.type==='BUY') counts.B++;
      else if(t.type==='SELL') counts.S++;
      else if(t.type==='SHORT') counts.P++;
      else if(t.type==='COVER') counts.C++;
    });
    const total = counts.B+counts.S+counts.P+counts.C;
    this.publish({counts,total});
  }
}
window['M7Logic']=new M7Logic();
export default window['M7Logic'];