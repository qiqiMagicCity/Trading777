import { calcWtdMtdYtdFromSnapshots } from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

describe("WTD 周一起算边界守护", () => {
  const d = (date: string, realized: number, unrealized: number): DailyResult => ({ date, realized, unrealized });

  it("周日快照不计入同周 WTD（周一起算）", () => {
    // Sun 2025-09-21, Mon 2025-09-22
    const daily: DailyResult[] = [
      d("2025-09-21T21:00:00Z", 10, 0),   // Sun
      d("2025-09-22T21:00:00Z", 20, 0),   // Mon
    ];

    // eval=Mon：WTD 只应计入 Mon（=20）
    const rMon = calcWtdMtdYtdFromSnapshots(daily, "2025-09-22");
    expect(Number(rMon.wtd.toFixed(2))).toBe(20.00);

    // eval=Tue：WTD 仍应从周一开始，包含 Mon 与 Tue（若 Tue 无数据则仍=20）
    const rTue = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect(Number(rTue.wtd.toFixed(2))).toBe(20.00);
  });
});
