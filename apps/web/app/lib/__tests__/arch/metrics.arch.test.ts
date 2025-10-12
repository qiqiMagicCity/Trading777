import glob from 'glob';
import * as fsx from 'fs';
const allow = [/\\util\\//, /shared\\//, /policies\\//];
test('calcM* modules must not import other calcM* modules', () => {
  const files = glob.sync('apps/web/app/**/*calcM*.ts?(x)');
  const re = /from\s+['\"](.+?)['\"]/g;
  for (const f of files) {
    const s = fsx.readFileSync(f, 'utf8'); let m;
    while ((m = re.exec(s))) {
      const imp = m[1];
      if (/calcM\d+/.test(imp) && !allow.some((a) => a.test(imp))) {
        throw new Error(`Forbidden cross-M import in ${f} -> ${imp}`);
      }
    }
  }
});
