import { resolveTradingDayStr, previousTradingDay, isTradingDay } from "@/app/lib/nyDay";

test("freeze weekend backfills to previous trading day", () => {
  const evalStr = resolveTradingDayStr(undefined, { freeze: "2025-10-05" }); // Sun
  expect(isTradingDay("2025-10-05")).toBe(false);
  expect(evalStr).toBe(previousTradingDay("2025-10-05"));
});

test("freeze holiday backfills to previous trading day", () => {
  const evalStr = resolveTradingDayStr(undefined, { freeze: "2025-12-25" }); // NYSE Christmas
  expect(evalStr).toBe(previousTradingDay("2025-12-25"));
});
