import ModuleBase from '../ModuleBase.js';
class M1Logic extends ModuleBase {
  constructor(){ super('M1'); this.calc(); }
  calc(){ this.publish({value:0}); }
}
window['M1Logic'] = new M1Logic();
export default window['M1Logic'];