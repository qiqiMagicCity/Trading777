import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M6View extends ModuleBase {
  constructor(){ super('M6'); this.container=document.querySelector('#M6-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){ 
    if(!this.container) return;
    const val = data.value ?? 0;
    this.container.textContent = Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(val); 
  }
}
window['M6View'] = new M6View();