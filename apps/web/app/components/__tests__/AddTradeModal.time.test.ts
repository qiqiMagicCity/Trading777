import { formatInTimeZone } from 'date-fns-tz';

import { toInputDateTime } from '../AddTradeModal';
import { NY_TZ } from '@/app/lib/time';
import { toNY } from '@/lib/timezone';

describe('AddTradeModal timezone helpers', () => {
  const expectedFormat = "yyyy-MM-dd'T'HH:mm:ss";

  it('formats Date objects using New York timezone', () => {
    const base = new Date('2024-05-01T13:45:12Z');
    expect(toInputDateTime(base)).toBe(
      formatInTimeZone(base, NY_TZ, expectedFormat),
    );
  });

  it('formats numeric timestamps with the same helper', () => {
    const base = new Date('2024-05-01T13:45:12Z');
    expect(toInputDateTime(base.getTime())).toBe(
      formatInTimeZone(base, NY_TZ, expectedFormat),
    );
  });

  it('normalizes local datetime strings as New York local time', () => {
    const local = '2024-05-01T09:30:15';
    const nyLocal = toNY(2024, 4, 1, 9, 30, 15);
    expect(toInputDateTime(local)).toBe(
      formatInTimeZone(nyLocal, NY_TZ, expectedFormat),
    );
  });

  it('keeps pure date strings anchored at midnight New York time', () => {
    const dateOnly = '2024-05-01';
    const nyMidnight = toNY('2024-05-01T00:00:00');
    expect(toInputDateTime(dateOnly)).toBe(
      formatInTimeZone(nyMidnight, NY_TZ, expectedFormat),
    );
  });
});
