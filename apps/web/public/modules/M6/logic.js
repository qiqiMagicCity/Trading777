import ModuleBase from '../ModuleBase.js';
class M6Logic extends ModuleBase{
  constructor(){ super('M6'); this.v3=0; this.v4=0;
    window.addEventListener('M3:update', e=>{this.v3=e.detail.value; this.update();});
    window.addEventListener('M4:update', e=>{this.v4=e.detail.value; this.update();});
  }
  update(){ this.publish({value: this.v3+this.v4}); }
}
window['M6Logic']=new M6Logic();
export default window['M6Logic'];