import { realizedPnLLong, realizedPnLShort, avgPrice, round2 } from '../../lib/money';

test('long pnl basic', () => {
  expect(realizedPnLLong(105, 95, 50)).toBe(500);
});
test('short pnl basic', () => {
  expect(realizedPnLShort(185, 180, 30)).toBe(150);
});
test('avg price stable', () => {
  const p = avgPrice(95*50 + 105*50, 100, 4);
  expect(round2(p)).toBe(100);
});
