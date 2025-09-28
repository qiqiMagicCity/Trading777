import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

const d = (date: string, realized: number, unrealized: number) => ({
  date,
  realized,
  unrealized,
});

describe("M11/M12/M13 snapshots with Δ-unrealized", () => {
  it("accumulates WTD/MTD/YTD with unrealized deltas", () => {
    // Mon/Tue/Wed（无起点前快照 → 基线=0）
    const daily = [
      d("2025-09-22T21:00:00Z", 100, 50), // ΔU=+50 → 当日 +150
      d("2025-09-23T21:00:00Z", -30, 20), // ΔU=-30 → 当日 -60
      d("2025-09-24T21:00:00Z", 0, -40), // ΔU=-60 → 当日 -60
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24"); // Wed
    expect(Number(r.wtd.toFixed(2))).toBe(30.0); // 150-60-60
    expect(Number(r.mtd.toFixed(2))).toBe(30.0);
    expect(Number(r.ytd.toFixed(2))).toBe(30.0);
  });

  it("respects baseline snapshot before window start", () => {
    const daily = [
      d("2025-09-21T21:00:00Z", 0, 10), // 基线：周起点前
      d("2025-09-22T21:00:00Z", 100, 50), // ΔU=+40 → 当日 +140
      d("2025-09-23T21:00:00Z", -30, 20), // ΔU=-30 → 当日 -60
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect(Number(r.wtd.toFixed(2))).toBe(80.0); // 140 - 60
  });
});
