import { toNY, nowNY } from '@/lib/timezone';
export async function getDailyResults(){
  const res = await fetch('./dailyResult.json');
  if(res.ok) return res.json();
  return [];
}
function startOfWeek(date){ // Monday
  const d=toNY(date);
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}
export function calcWTD(list){
  if(!list.length) return 0;
  const last=toNY(list[list.length-1].date);
  const start=startOfWeek(last);
  return list.filter(r=> toNY(r.date)>=start)
             .reduce((a,b)=>a+b.pnl,0);
}
export function calcSince(list,startStr){
  return list.filter(r=>r.date>=startStr).reduce((a,b)=>a+b.pnl,0);
}