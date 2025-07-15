import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M2View extends ModuleBase {
  constructor(){ super('M2'); this.container=document.querySelector('#M2-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){ 
    if(!this.container) return;
    const val = data.value ?? 0;
    this.container.textContent = val; 
  }
}
window['M2View'] = new M2View();