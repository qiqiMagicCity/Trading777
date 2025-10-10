import { normalizeCloseMap } from "@/app/lib/prices/normalizeCloseMap";

test('normalize both shapes', () => {
  const a = normalizeCloseMap({ '2025-10-03': { AMZN: '219.51' } });
  const b = normalizeCloseMap({ AMZN: { '2025-10-03': '219.51' } });
  expect(a['2025-10-03'].AMZN).toBeCloseTo(219.51);
  expect(b['2025-10-03'].AMZN).toBeCloseTo(219.51);
});
