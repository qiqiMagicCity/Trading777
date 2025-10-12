import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

const d = (date: string, realized: number, unrealized: number) => ({
  date,
  realized,
  unrealized,
});

describe("M11/M12/M13 snapshots with Δ-unrealized (updated baseline)", () => {
  it("accumulates with baseline when available", () => {
    // 周日前有一条基线：Sun U=10
    const daily = [
      d("2025-09-21T21:00:00Z", 0, 10), // baseline
      d("2025-09-22T21:00:00Z", 100, 50), // ΔU=+40 → +140
      d("2025-09-23T21:00:00Z", -30, 20), // ΔU=-30 → -60
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect(Number(r.wtd.toFixed(2))).toBe(80.0); // 140 - 60
  });

  it("accumulates without baseline: first day ΔU=0", () => {
    const daily = [
      d("2025-09-22T21:00:00Z", 100, 50),
      d("2025-09-23T21:00:00Z", -30, 20),
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect(Number(r.wtd.toFixed(2))).toBe(90.0); // 累计实盈70 + 期末浮盈20
  });
});
