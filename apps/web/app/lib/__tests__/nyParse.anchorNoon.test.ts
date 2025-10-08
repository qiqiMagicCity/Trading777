import { tsFromYmdAtNoonUTC } from '../nyParse';

describe('nyParse: UTC instant of NY local 12:00', () => {
  test('winter: 2025-01-13 12:00 NY == 17:00 UTC', () => {
    const timestamp = tsFromYmdAtNoonUTC('2025-01-13');
    const instant = new Date(timestamp);
    expect(instant.getUTCHours()).toBe(17);
    expect(instant.getUTCFullYear()).toBe(2025);
  });

  test('summer: 2025-06-02 12:00 NY == 16:00 UTC', () => {
    const timestamp = tsFromYmdAtNoonUTC('2025-06-02');
    const instant = new Date(timestamp);
    expect(instant.getUTCHours()).toBe(16);
    expect(instant.getUTCFullYear()).toBe(2025);
  });
});

