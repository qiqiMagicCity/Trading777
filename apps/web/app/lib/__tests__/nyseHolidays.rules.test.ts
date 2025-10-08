import { isNyseHoliday } from '../nyseHolidays';

describe('NYSE holidays - rules & observed', () => {
  test('2025-04-18 Good Friday', () => {
    expect(isNyseHoliday('2025-04-18')).toBe(true);
  });

  test('2025-07-04 Independence Day (Fri)', () => {
    expect(isNyseHoliday('2025-07-04')).toBe(true);
  });

  test('2026-07-03 observed for Jul 4 (Sat)', () => {
    expect(isNyseHoliday('2026-07-03')).toBe(true);
  });

  test('2025-11-27 Thanksgiving (Thu)', () => {
    expect(isNyseHoliday('2025-11-27')).toBe(true);
  });

  test('a normal trading day 2025-07-02 is not a holiday', () => {
    expect(isNyseHoliday('2025-07-02')).toBe(false);
  });
});

