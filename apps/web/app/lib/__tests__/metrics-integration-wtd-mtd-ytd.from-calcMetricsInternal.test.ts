import { calcMetricsInternal } from "../../lib/metrics";
import type { DailyResult } from "../../lib/types";

describe("calcMetricsInternal → M11/M12/M13 wired to snapshots", () => {
  const d = (date: string, realized: number, unrealized: number): DailyResult => ({
    date,
    realized,
    unrealized,
  });

  it("WTD/MTD/YTD accumulate snapshots even on non-trade day", () => {
    const dailyResults: DailyResult[] = [
      d("2025-09-22T21:00:00Z", 100, 50),
      d("2025-09-23T21:00:00Z", -30, 20),
      d("2025-09-24T21:00:00Z", 0, -40),
    ];

    const trades: any[] = [];
    const positions: any[] = [];
    const evalDayStr = "2025-09-25";

    const res = calcMetricsInternal(trades as any, positions as any, dailyResults, {
      tradingDateStr: evalDayStr,
    });

    const m11 = Number(res.M11.toFixed(2));
    const m12 = Number(res.M12.toFixed(2));
    const m13 = Number(res.M13.toFixed(2));

    expect(m11).toBe(100.0);
    expect(m12).toBe(100.0);
    expect(m13).toBe(100.0);
  });
});
