import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M8View extends ModuleBase{
  constructor(){ super('M8'); this.container=document.querySelector('#M8-value'); this.subscribe(e=>this.render(e.detail)); }
  render(data){
    if(!this.container) return;
    const {counts,total}=data;
    this.container.textContent=`累计 ${total} 笔 (B:${counts.B},S:${counts.S},P:${counts.P},C:${counts.C})`;
  }
}
window['M8View']=new M8View();