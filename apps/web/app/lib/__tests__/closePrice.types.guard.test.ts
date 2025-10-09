import { isYmd, type ClosePriceBucket } from "../dailyResults";

test("isYmd only accepts YYYY-MM-DD", () => {
  expect(isYmd("2025-09-18")).toBe(true);
  expect(isYmd("2025/09/18")).toBe(false);
  expect(isYmd("__sources")).toBe(false);
});

test("ClosePriceBucket allows __sources and date-number pairs", () => {
  const bucket: ClosePriceBucket = {
    "2025-09-18": 123.45,
    __sources: { "2025-09-18": "official/import" },
  };
  expect(bucket["2025-09-18"]).toBe(123.45);
  expect(bucket.__sources?.["2025-09-18"]).toBe("official/import");
});
