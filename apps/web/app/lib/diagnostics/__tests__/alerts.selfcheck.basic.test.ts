import { normalizeCloseMap } from "@/app/lib/prices/normalizeCloseMap";

test("normalize accepts both shapes", () => {
  const byDate = normalizeCloseMap({ AMZN: { "2025-10-03": "219.51" } });
  expect(byDate["2025-10-03"].AMZN).toBeCloseTo(219.51);
});
