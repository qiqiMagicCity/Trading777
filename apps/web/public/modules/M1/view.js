import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M1View extends ModuleBase {
  constructor(){ super('M1'); this.container=document.querySelector('#M1-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){ 
    if(!this.container) return;
    const val = data.value ?? 0;
    this.container.textContent = val; 
  }
}
window['M1View'] = new M1View();