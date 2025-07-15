import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M7View extends ModuleBase {
  constructor(){ super('M7'); this.container=document.querySelector('#M7-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){ 
    if(!this.container) return;
    const val = data.value ?? 0;
    this.container.textContent = val; 
  }
}
window['M7View'] = new M7View();