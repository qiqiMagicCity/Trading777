import ModuleBase from '../ModuleBase.js';
import { getDailyResults, calcSince } from '../../utils/dailyResult.js';
class M12Logic extends ModuleBase{
 constructor(){ super('M12'); this.calc(); }
 async calc(){
   const list = await getDailyResults();
   const total = calcSince(list,'2025-07-01');
   this.publish({value:total});
 }
}
window['M12Logic']=new M12Logic();
export default window['M12Logic'];