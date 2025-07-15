import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M12View extends ModuleBase{
  constructor(){ super('M12'); this.container=document.querySelector('#M12-value'); this.subscribe(e=>this.render(e.detail));}
  render(data){ if(this.container) this.container.textContent = Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(data.value);}
}
window['M12View']=new M12View();