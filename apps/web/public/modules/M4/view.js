import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M4View extends ModuleBase {
  constructor(){ super('M4'); this.container=document.querySelector('#M4-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){ 
    if(!this.container) return;
    const val = data.value ?? 0;
    this.container.textContent = Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(val); 
  }
}
window['M4View'] = new M4View();