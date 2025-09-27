import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
const bad = /^(<<<<<<<|=======|>>>>>>>)\s/m;
const walk = (d)=>readdirSync(d).flatMap(n=>{
  const p=join(d,n); return statSync(p).isDirectory()?walk(p):[p];
});
const files = walk(process.cwd()).filter(p=>!p.endsWith('package-lock.json'));
for (const f of files) {
  const t = readFileSync(f,'utf8');
  if (bad.test(t)) { console.error('Conflict marker in', f); process.exit(1); }
}
console.log('No conflict markers.');
