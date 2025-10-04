import { getTradingDateYMD, ymdStr } from '@/lib/tradingDay';

function etDate(y: number, m: number, d: number, h: number, mi: number = 0, s: number = 0) {
  return new Date(Date.UTC(y, m - 1, d, h + 4, mi, s));
}

describe('getTradingDateYMD', () => {
  test('盘前 09:15 ET 仍归属当日', () => {
    const d = etDate(2025, 9, 26, 9, 15);
    expect(ymdStr(getTradingDateYMD(d))).toBe('2025-09-26');
  });

  test('09:31 ET 归属当日', () => {
    const d = etDate(2025, 9, 26, 9, 31);
    expect(ymdStr(getTradingDateYMD(d))).toBe('2025-09-26');
  });

  test('周六任意时刻 -> 回退到周五', () => {
    const d = etDate(2025, 9, 27, 12, 0);
    expect(ymdStr(getTradingDateYMD(d))).toBe('2025-09-26');
  });
});
