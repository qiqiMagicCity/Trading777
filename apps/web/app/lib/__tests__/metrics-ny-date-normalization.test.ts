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
    expect(explain.rows).toHaveLength(1);
    expect(explain.rows[0]).toMatchObject({
      day: "2025-09-23",
      realized: 40,
      unrealized: 30,
    });
  });

  it("retains correct WTD/MTD/YTD when the latest snapshot is late-night", () => {
    const daily: DailyResult[] = [
      d("2025-09-22T15:00:00-04:00", 100, 50),
      d("2025-09-23T23:30:00-04:00", 40, 30),
    ];

    const { wtd, mtd, ytd } = calcWtdMtdYtdFromSnapshots(daily, "2025-09-23");
    expect({ wtd, mtd, ytd }).toEqual({ wtd: 120, mtd: 120, ytd: 120 });

    const metrics = calcMetricsInternal([] as any, [] as any, daily, {
      tradingDateStr: "2025-09-23",
    });

    expect(metrics.M11).toBeCloseTo(120, 5);
    expect(metrics.M12).toBeCloseTo(120, 5);
    expect(metrics.M13).toBeCloseTo(120, 5);
  });

  it("counts midnight ISO snapshots on the correct New York day", () => {
    const daily: DailyResult[] = [
      d("2025-09-23T23:00:00-04:00", 100, 0),
      d("2025-09-24T00:00:00Z", 50, 0),
    ];

    const { wtd, mtd, ytd } = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect({ wtd, mtd, ytd }).toEqual({ wtd: 150, mtd: 150, ytd: 150 });
  });
});
