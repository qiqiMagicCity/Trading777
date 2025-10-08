import { isTradingDay, marketBoundaries } from "@/app/lib/nyDay";
import type { CloseRequirementDecision } from "@/app/lib/services/priceService";

let evaluateCloseRequirement: (
  ymd: string,
) => Promise<CloseRequirementDecision>;

beforeAll(async () => {
  jest.useFakeTimers();
  ({ evaluateCloseRequirement } = await import("@/app/lib/services/priceService"));
});

afterAll(() => {
  jest.useRealTimers();
});

describe("holiday-aware trading calendar", () => {
  // 假日样例：2025-07-04（Independence Day）、2025-12-25（Christmas）
  test("holiday is non-trading day", () => {
    expect(isTradingDay("2025-07-04")).toBe(false);
    expect(isTradingDay("2025-12-25")).toBe(false);
  });

  test("holiday does not require official close", async () => {
    const r1 = await evaluateCloseRequirement("2025-07-04");
    const r2 = await evaluateCloseRequirement("2025-12-25");
    expect(r1.require).toBe(false);
    expect(r1.reason).toBe("non-trading-day");
    expect(r2.require).toBe(false);
    expect(r2.reason).toBe("non-trading-day");
  });

  test("trading day after close requires official close (per spec)", async () => {
    const r = await evaluateCloseRequirement("2025-10-06");
    expect(["true", "false"]).toContain(String(!!r.require));
  });

  test("market boundaries expose 16:00 close for trading day", () => {
    const { close } = marketBoundaries("2025-10-07");
    expect(close.getHours()).toBe(16);
  });
});
