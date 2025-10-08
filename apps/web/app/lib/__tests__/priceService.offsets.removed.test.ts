import fs from 'fs';
import path from 'path';

describe('priceService: remove manual millisecond offsets', () => {
  const file = path.resolve(__dirname, '../services/priceService.ts');
  const src = fs.readFileSync(file, 'utf8');

  test('no DAY_MS constant', () => {
    expect(src).not.toMatch(/\bDAY_MS\b/);
  });

  test('no 12h middayOffset literal', () => {
    // 允许存在文本注释，不允许存在实际常量定义或计算表达式
    expect(src).not.toMatch(/12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
});
