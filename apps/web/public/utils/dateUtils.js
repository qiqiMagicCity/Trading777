import { toNY, nowNY } from '@/lib/timezone';
window.NY_TZ = -4;
window.LON_TZ = 1;

window.nyNow = function(){
  const d = nowNY();
  return toNY(d.getTime() + (window.NY_TZ - d.getTimezoneOffset()/60)*3600000);
};
window.lonNow = function(){
  const d=nowNY();
  return toNY(d.getTime() + (window.LON_TZ - d.getTimezoneOffset()/60)*3600000);
};