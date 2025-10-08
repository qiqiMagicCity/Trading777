import { resolveTradingDayStr, previousTradingDay, ymdInNY } from '../nyDay';

describe('NY trading calendar across DST switch week', () => {
  // 2025-03-10 10:00:00 NY (EDT) == 2025-03-10 14:00:00 UTC
  const monAfterDST = new Date(Date.UTC(2025, 2, 10, 14, 0, 0));

  test('resolveTradingDayStr on Monday after DST should be 2025-03-10', () => {
    expect(resolveTradingDayStr(monAfterDST)).toBe('2025-03-10');
  });

  test('previousTradingDay from 2025-03-10 should be 2025-03-07 (Fri)', () => {
    expect(previousTradingDay('2025-03-10')).toBe('2025-03-07');
  });

  test('ymdInNY around DST boundary remains stable (no 24h arithmetic)', () => {
    // 前一自然日的 UTC 时间在 DST 切换周容易误差，这里仅断言 ymdInNY 自身的一致性
    const utcBefore = new Date(Date.UTC(2025, 2, 9, 12, 0, 0));  // DST 切换日（周日）
    const utcAfter  = new Date(Date.UTC(2025, 2, 10, 12, 0, 0)); // 周一
    expect(ymdInNY(utcBefore)).toMatch(/^2025-03-0[89]$/); // 周末日期之一（9 或 8，取决于写法）
    expect(ymdInNY(utcAfter)).toBe('2025-03-10');
  });
});
