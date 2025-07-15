import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M5View extends ModuleBase{
  constructor(){ super('M5'); this.container=document.querySelector('#M5-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){
    if(this.container) this.container.textContent = `交易视角：${data.v1.toFixed(2)} FIFO视角：${data.v2.toFixed(2)}`;
  }
}
window['M5View']=new M5View();