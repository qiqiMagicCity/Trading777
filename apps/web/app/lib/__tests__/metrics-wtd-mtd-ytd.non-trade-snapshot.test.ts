import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

const d = (date: string, realized: number, unrealized: number) => ({
  date,
  realized,
  unrealized,
});

describe("M11/M12/M13 snapshots with Δ-unrealized (updated baseline)", () => {
  it("accumulates with baseline when available", () => {
    const daily = [
      d("2025-09-21T21:00:00Z", 0, 10), // 基线：周起点前
      d("2025-09-22T21:00:00Z", 100, 50), // ΔU=+40 → 当日 +140
      d("2025-09-23T21:00:00Z", -30, 20), // ΔU=-30 → 当日 -60
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
    expect(Number(r.wtd.toFixed(2))).toBe(40.0); // +100 + (-60) = 40
  });
});
