import {
  calcMetricsInternal,
  calcWtdMtdYtdFromSnapshots,
  explainWtdMtdYtdFromSnapshots,
} from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

const d = (date: string, realized: number, unrealized: number): DailyResult => ({
  date,
  realized,
  unrealized,
});

describe("NY day normalization", () => {
  it("keeps late-night snapshots on the same New York date", () => {
    const daily: DailyResult[] = [
      d("2025-09-23T09:30:00-04:00", 10, 15),
      d("2025-09-23T23:30:00-04:00", 40, 30),
    ];

    const explain = explainWtdMtdYtdFromSnapshots(daily, "2025-09-23");

    expect(explain.evalDay).toBe("2025-09-23");
    const target = explain.calendar.find((row) => row.day === "2025-09-23");
    expect(target).toMatchObject({ day: "2025-09-23", pnl: 40 });
  });

  it("retains correct WTD/MTD/YTD when the latest snapshot is late-night", () => {
    const daily: DailyResult[] = [
      d("2025-09-22T15:00:00-04:00", 100, 50),
      d("2025-09-23T23:30:00-04:00", 40, 30),
    ];

    const { wtd, mtd, ytd } = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 170, mtd: 170, ytd: 170 });

    const metrics = calcMetricsInternal([] as any, [] as any, daily, {
      tradingDateStr: "2025-09-23",
    });

    expect(metrics.M11).toBeCloseTo(170, 5);
    expect(metrics.M12).toBeCloseTo(170, 5);
    expect(metrics.M13).toBeCloseTo(170, 5);
  });

  it("counts midnight ISO snapshots on the correct New York day", () => {
    const daily: DailyResult[] = [
      d("2025-09-23T23:00:00-04:00", 100, 0),
      d("2025-09-24T00:00:00Z", 50, 0),
    ];

    const { wtd, mtd, ytd } = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect({ wtd, mtd, ytd }).toEqual({ wtd: 150, mtd: 150, ytd: 150 });
  });

  it("uses the previous Friday as the week baseline for Monday eval day", () => {
    const daily: DailyResult[] = [
      d("2025-09-26T21:00:00Z", 5, 12),
      d("2025-09-29T21:00:00Z", 3, 15),
    ];

    const snapshot = calcWtdMtdYtdFromSnapshots(daily, "2025-09-29");

    expect(snapshot.baseline.wtd.baselineDate).toBe("2025-09-26");
  });
});
