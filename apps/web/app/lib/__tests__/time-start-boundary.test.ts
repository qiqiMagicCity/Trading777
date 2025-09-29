import {
  startOfWeekNY,
  startOfMonthNY,
  startOfYearNY,
  nyDateStr,
} from '../time';
import { computePeriods, type Daily } from '../metrics-periods';

describe('NY start-of-period helpers', () => {
  it('keeps Monday date for week start when given YYYY-MM-DD', () => {
    const result = startOfWeekNY('2025-09-22');
    expect(nyDateStr(result)).toBe('2025-09-22');
  });

  it('keeps first-day date for month start when given YYYY-MM-DD', () => {
    const result = startOfMonthNY('2025-09-01');
    expect(nyDateStr(result)).toBe('2025-09-01');
  });

  it('keeps first-day date for year start when given YYYY-MM-DD', () => {
    const result = startOfYearNY('2025-01-01');
    expect(nyDateStr(result)).toBe('2025-01-01');
  });
});

describe('computePeriods boundary handling', () => {
  it('excludes previous week data when evaluation date is Monday', () => {
    const daily: Daily[] = [
      { date: '2025-09-21', realized: 100, unrealized: 0 },
      { date: '2025-09-22', realized: 10, unrealized: 0 },
    ];

    const periods = computePeriods(daily, '2025-09-22');
    expect(periods.M11).toBe(10);
  });

  it('excludes previous month data when evaluation date is first day', () => {
    const daily: Daily[] = [
      { date: '2025-08-31', realized: 200, unrealized: 0 },
      { date: '2025-09-01', realized: 20, unrealized: 0 },
    ];

    const periods = computePeriods(daily, '2025-09-01');
    expect(periods.M12).toBe(20);
  });

  it('excludes previous year data when evaluation date is first day', () => {
    const daily: Daily[] = [
      { date: '2024-12-31', realized: 300, unrealized: 0 },
      { date: '2025-01-01', realized: 30, unrealized: 0 },
    ];

    const periods = computePeriods(daily, '2025-01-01');
    expect(periods.M13).toBe(30);
  });
});
