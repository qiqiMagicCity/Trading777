import fs from 'fs';
import path from 'path';

const targets = [
  path.resolve(__dirname, '../metrics.ts'),
  path.resolve(__dirname, '../metrics-periods.ts'),
  path.resolve(__dirname, '../runAll.ts'),
].filter((filePath) => fs.existsSync(filePath));

describe('no local/UTC ambiguous constructs in metrics & runAll', () => {
  test('dangerous new Date("YYYY-MM-DDT00:00:00[Z]") removed', () => {
    const riskyPattern =
      /new\s+Date\s*\(\s*`?\$?{?\s*\w+\s*}?`?\s*\+?\s*["']T00:00:00Z?["']\s*\)/;
    for (const file of targets) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(riskyPattern);
    }
  });

  test('direct new Date(d.date) removed (use NY-noon helpers instead)', () => {
    const directPattern = /new\s+Date\s*\(\s*d\.date\s*\)/;
    for (const file of targets) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(directPattern);
    }
  });
});

