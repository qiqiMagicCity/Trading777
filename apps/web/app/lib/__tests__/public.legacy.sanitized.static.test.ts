import fs from 'fs';
import path from 'path';

const PUB = path.resolve(__dirname, '../../../public/js');
const files = fs.existsSync(PUB)
  ? fs.readdirSync(PUB).filter(f => f.endsWith('.js') && f !== 'ny-safe.js')
  : [];

describe('public/js legacy sanitized guard', () => {
  test('forbid dangerous date constructs in public/js', () => {
    const forbid = [
      /toISOString\(\)\.slice\(0,\s*10\)/,               // a)
      /new\s+Date\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/, // b)
      /Date\.UTC\s*\(/,                                     // d)
      /T00:00:00Z['"]/,                                      // d) 手拼 UTC 零点
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PUB, f), 'utf8');
      for (const r of forbid) {
        expect(src).not.toMatch(r);
      }
    }
  });
});
