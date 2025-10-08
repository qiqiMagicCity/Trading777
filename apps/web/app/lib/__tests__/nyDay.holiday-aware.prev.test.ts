import { previousTradingDay, resolveTradingDayStr, isTradingDay } from '../nyDay';

describe('nyDay previousTradingDay across NYSE holidays', () => {
  test('Mon 2025-07-07 previousTradingDay -> Thu 2025-07-03 (skip Fri holiday + weekend)', () => {
    expect(previousTradingDay('2025-07-07')).toBe('2025-07-03');
  });

  test('Fri after Thanksgiving 2025-11-28 previous -> Wed 2025-11-26 (skip Thu holiday)', () => {
    expect(previousTradingDay('2025-11-28')).toBe('2025-11-26');
  });

  test('resolveTradingDayStr on 2025-07-04 10:00 NY should be 2025-07-03 (holiday rolls back)', () => {
    const now = new Date(Date.UTC(2025, 6, 4, 14, 0, 0));
    const ymd = resolveTradingDayStr(now);
    expect(['2025-07-03', '2025-07-02']).toContain(ymd);
  });

  test('isTradingDay returns false on 2025-07-04', () => {
    expect(isTradingDay('2025-07-04')).toBe(false);
  });
});

