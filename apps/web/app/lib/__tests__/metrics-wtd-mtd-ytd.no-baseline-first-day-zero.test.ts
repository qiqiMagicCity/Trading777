// 无基线 → 首日 ΔU = 0
import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";

const d = (date: string, realized: number, unrealized: number) => ({
  date,
  realized,
  unrealized,
});

describe("WTD/MTD/YTD: no baseline snapshot → first-day ΔU=0", () => {
  it("WTD uses only in-window change when no prior snapshot", () => {
    // Mon/Tue/Wed，仅窗口内三天；无周日前的任何快照
    const daily = [
      d("2025-09-22T21:00:00Z", 3, 8),
      d("2025-09-23T21:00:00Z", 2, 12),
      d("2025-09-24T21:00:00Z", 0, 15),
    ];
    const r = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");
    expect(Number(r.wtd.toFixed(2))).toBe(20.0);
    expect(Number(r.mtd.toFixed(2))).toBe(20.0);
    expect(Number(r.ytd.toFixed(2))).toBe(20.0);
    expect(r.baseline.wtd.status).toBe("ok_zero");
    expect(r.baseline.mtd.status).toBe("ok_zero");
    expect(r.baseline.ytd.status).toBe("ok_zero");
  });
});
