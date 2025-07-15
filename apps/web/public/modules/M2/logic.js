import ModuleBase from '../ModuleBase.js';
class M2Logic extends ModuleBase {
  constructor(){ super('M2'); this.calc(); }
  calc(){ this.publish({value:0}); }
}
window['M2Logic'] = new M2Logic();
export default window['M2Logic'];