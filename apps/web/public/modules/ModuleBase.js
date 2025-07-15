export default class ModuleBase {
  constructor(name){ this.name = name; this.eventName = `${name}:update`; }
  publish(data){ window.dispatchEvent(new CustomEvent(this.eventName,{detail:data})); }
  subscribe(handler){ window.addEventListener(this.eventName,handler); }
  log(...msg){ console.log(`[${this.name}]`,...msg); }
  selfCheck(){ return true; }
}