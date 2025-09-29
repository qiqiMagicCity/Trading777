import { normalizeToNyDay, nyDateStrSafe } from "../time";

describe("normalizeToNyDay", () => {
  const inputs = [
    "2025-09-24",
    "2025-09-24T00:00:00",
    "2025-09-24T00:00:00.000",
    "2025-09-24 00:00:00",
    "2025-09-24T00:00:00.000000Z",
    "2025-09-24T00:00:00+0000",
  ] as const;

  test.each(inputs)("normalizes %s to NY midday and preserves day", (input) => {
    const normalized = normalizeToNyDay(input);
    expect(normalized).toBe("2025-09-24T12:00:00Z");
    expect(nyDateStrSafe(input)).toBe("2025-09-24");
  });
});
