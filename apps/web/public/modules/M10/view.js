import ModuleBase from '../ModuleBase.js';
import './logic.js';
class M10View extends ModuleBase{
  constructor(){ super('M10'); this.container=document.querySelector('#M10-value'); this.subscribe(e=>this.render(e.detail));}
  render(data){
    if(!this.container) return;
    const {wins,losses,winRate}=data;
    this.container.textContent = `胜率: ${winRate.toFixed(1)}% (W:${wins} / L:${losses})`;
  }
}
window['M10View']=new M10View();