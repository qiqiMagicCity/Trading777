import { resolveTradingDayStr, ymdInNY, calendarTradingDayStr, previousTradingDay, isTradingDay, NY_TZ } from '../nyDay';
import { getLatestTradingDayStr as rawLatest } from '../timezone';

describe('nyDay (Scaffold)', () => {
  test('freeze 参数应直接透传', () => {
    expect(resolveTradingDayStr(Date.now(), { freeze: '2025-10-06' })).toBe('2025-10-06');
  });

  test('resolveTradingDayStr 行为等同现有 getLatestTradingDayStr', () => {
    // 固定时间：UTC 2025-10-06T14:30:00Z（纽约夏令时时间相当于 10:30）
    const now = new Date(Date.UTC(2025, 9, 6, 14, 30));
    expect(resolveTradingDayStr(now)).toBe(rawLatest(now));
  });

  test('辅助导出可用（存在性与格式校验）', () => {
    const now = Date.now();
    const y = ymdInNY(now);
    expect(typeof y).toBe('string');
    expect(y).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const c = calendarTradingDayStr(now);
    expect(typeof c).toBe('string');
    expect(c).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(typeof previousTradingDay).toBe('function');
    expect(typeof isTradingDay).toBe('function');
    expect(NY_TZ).toBe('America/New_York');
  });
});
