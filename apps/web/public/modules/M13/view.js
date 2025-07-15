import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M13View extends ModuleBase{
  constructor(){ super('M13'); this.container=document.querySelector('#M13-value'); this.subscribe(e=>this.render(e.detail));}
  render(data){ if(this.container) this.container.textContent = Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(data.value);}
}
window['M13View']=new M13View();