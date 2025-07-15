import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M9View extends ModuleBase{
  constructor(){ super('M9'); this.container=document.querySelector('#M9-value'); this.subscribe(e=>this.render(e.detail));}
  render(data){
    if(this.container) this.container.textContent = Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(data.value);
  }
}
window['M9View']=new M9View();