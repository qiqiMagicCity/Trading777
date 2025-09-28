import { calcWtdMtdYtdFromSnapshots } from "../metrics";
import type { DailyResult } from "../types";

describe("deriveWindowPnl 同日去重", () => {
  test("Case1: 同日两条记录仅取最后一条", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-09-23T10:00:00-04:00",
        realized: 5,
        unrealized: 90,
        unrealizedDelta: 10,
      },
      {
        date: "2025-09-23T16:30:00-04:00",
        realized: 7,
        unrealized: 95,
        unrealizedDelta: 5,
      },
      {
        date: "2025-09-24T16:00:00-04:00",
        realized: 0,
        unrealized: 100,
        unrealizedDelta: 5,
      },
    ];

    const result = calcWtdMtdYtdFromSnapshots(drs, "2025-09-24");
    expect(result.wtd).toBe(17);
    expect(result.mtd).toBe(17);
    expect(result.ytd).toBe(17);
  });

  test("Case2: 仅评估日多次落盘也只取最后一条", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-09-24T09:30:00-04:00",
        realized: 2,
        unrealized: 50,
        unrealizedDelta: 2,
      },
      {
        date: "2025-09-24T16:00:00-04:00",
        realized: 3,
        unrealized: 55,
        unrealizedDelta: 3,
      },
    ];

    const result = calcWtdMtdYtdFromSnapshots(drs, "2025-09-24");
    expect(result.wtd).toBe(6);
    expect(result.mtd).toBe(6);
    expect(result.ytd).toBe(6);
  });

  test("Case3: 混合多日乱序，按纽约日去重后升序计算", () => {
    const drs: DailyResult[] = [
      {
        date: "2025-09-24T16:00:00-04:00",
        realized: 1,
        unrealized: 50,
        unrealizedDelta: 2,
      },
      {
        date: "2025-09-22T09:00:00-04:00",
        realized: 1,
        unrealized: 30,
        unrealizedDelta: 2,
      },
      {
        date: "2025-09-23T15:00:00-04:00",
        realized: -2,
        unrealized: 40,
        unrealizedDelta: -1,
      },
      {
        date: "2025-09-22T18:00:00-04:00",
        realized: 4,
        unrealized: 32,
        unrealizedDelta: 2,
      },
      {
        date: "2025-09-24T08:00:00-04:00",
        realized: 0,
        unrealized: 48,
        unrealizedDelta: -2,
      },
      {
        date: "2025-09-21T16:00:00-04:00",
        realized: 0,
        unrealized: 28,
        unrealizedDelta: 0,
      },
      {
        date: "2025-09-19T12:00:00-04:00",
        realized: 1,
        unrealized: 25,
        unrealizedDelta: 1,
      },
    ];

    const result = calcWtdMtdYtdFromSnapshots(drs, "2025-09-24");
    expect(result.wtd).toBe(25);
    expect(result.mtd).toBe(30);
    expect(result.ytd).toBe(30);
  });
});
