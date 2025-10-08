import fs from 'fs';
import path from 'path';

const file = path.resolve(__dirname, '../dailyResults.ts');
const exists = fs.existsSync(file);

(exists ? describe : describe.skip)('dailyResults import source unified to nyDay', () => {
  const src = fs.readFileSync(file, 'utf8');

  test('imports ./nyDay', () => {
    expect(src).toMatch(/from ['"]\.\/nyDay['"]/);
  });

  test('does not import ./marketHours directly', () => {
    expect(src).not.toMatch(/from ['"]\.\/marketHours['"]/);
  });
});

