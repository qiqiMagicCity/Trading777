import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

describe("M11/M12/M13 snapshots only", () => {
  const d = (date: string, realized: number, unrealized: number) => ({
    date,
    realized,
    unrealized,
  });

  it("accumulates WTD/MTD/YTD including non-trade daily snapshots", () => {
    const daily = [
      d("2025-09-22T21:00:00Z", 100, 50),
      d("2025-09-23T21:00:00Z", -30, 20),
      d("2025-09-24T21:00:00Z", 0, -40),
    ];
    const r1 = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");
    expect(Number(r1.wtd.toFixed(2))).toBe(100.0);
    expect(Number(r1.mtd.toFixed(2))).toBe(100.0);
    expect(Number(r1.ytd.toFixed(2))).toBe(100.0);

    const r2 = calcWtdMtdYtdFromSnapshots(daily, "2025-09-25");
    expect(Number(r2.wtd.toFixed(2))).toBe(100.0);
  });

  it("uses the last snapshot within the same day", () => {
    const daily = [
      d("2025-09-24T15:00:00Z", 10, 10),
      d("2025-09-24T21:00:00Z", 10, 90),
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");
    expect(Number(r.wtd.toFixed(2))).toBe(100.0);
  });
});
