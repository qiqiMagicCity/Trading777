import { calcWtdMtdYtdFromSnapshots } from "../metrics";
import { computePeriods } from "../metrics-periods";
import type { DailyResult } from "../types";

describe("calcWtdMtdYtdFromSnapshots baseline fix", () => {
  test("Case A: 使用硬基线", () => {
    const daily: DailyResult[] = [
      { date: "2024-09-20", realized: 0, unrealized: 100, unrealizedDelta: 0 },
      { date: "2024-09-23", realized: 3, unrealized: 110, unrealizedDelta: 10 },
      { date: "2024-09-24", realized: -2, unrealized: 108, unrealizedDelta: -2 },
      { date: "2024-09-25", realized: 4, unrealized: 120, unrealizedDelta: 12 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-09-25");
    expect(result.wtd).toBeCloseTo(25);
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
    expect(result.degraded).toEqual({ wtd: false, mtd: true, ytd: true });
  });

  test("Case B: 基于 ΔU 反推基线", () => {
    const daily: DailyResult[] = [
      { date: "2024-10-01", realized: 10, unrealized: 100, unrealizedDelta: 5 },
      { date: "2024-10-02", realized: 0, unrealized: 102, unrealizedDelta: 2 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-10-02");
    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("Case C: 仅评估日一行", () => {
    const daily: DailyResult[] = [
      { date: "2024-10-03", realized: 8, unrealized: 12, unrealizedDelta: 12 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-10-03");
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
  });

  test("Case G: 周/月具备基线但年线缺口退化", () => {
    const daily: DailyResult[] = [
      { date: "2023-12-29", realized: 0, unrealized: 10, unrealizedDelta: 0 },
      { date: "2024-08-30", realized: 0, unrealized: 100, unrealizedDelta: 90 },
      { date: "2024-09-02", realized: 5, unrealized: 105, unrealizedDelta: 5 },
      { date: "2024-09-03", realized: -3, unrealized: 110, unrealizedDelta: 5 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-09-03");

    expect(result.degraded).toEqual({ wtd: false, mtd: false, ytd: true });
    expect(result.wtd).toBeCloseTo(12);
    expect(result.mtd).toBeCloseTo(12);
    expect(result.ytd).toBeNaN();
  });

  test("Case H: 窗口仅含评估日时标记退化并返回 NaN", () => {
    const daily: DailyResult[] = [
      { date: "2023-12-29", realized: 0, unrealized: 80, unrealizedDelta: 0 },
      { date: "2024-09-25", realized: 5, unrealized: 120, unrealizedDelta: 40 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-09-25");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("Case I: 基线过期时退化为 NaN", () => {
    const daily: DailyResult[] = [
      { date: "2024-09-20", realized: 0, unrealized: 100, unrealizedDelta: 0 },
      { date: "2024-09-24", realized: 5, unrealized: 130, unrealizedDelta: 30 },
      { date: "2024-09-25", realized: -2, unrealized: 128, unrealizedDelta: -2 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-09-25");

    expect(result.degraded.wtd).toBe(true);
    expect(result.wtd).toBeNaN();
    expect(result.degraded.mtd).toBe(true);
    expect(result.degraded.ytd).toBe(true);
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test(
    "Case J: 窗口首日存在但最近基线早于上一交易日时退化",
    () => {
      const daily: DailyResult[] = [
        { date: "2023-12-28", realized: 0, unrealized: 80, unrealizedDelta: 0 },
        { date: "2024-09-27", realized: 0, unrealized: 120, unrealizedDelta: 0 },
        { date: "2024-10-01", realized: 3, unrealized: 125, unrealizedDelta: 5 },
        { date: "2024-10-02", realized: -1, unrealized: 124, unrealizedDelta: -1 },
        { date: "2024-10-07", realized: 4, unrealized: 130, unrealizedDelta: 6 },
        { date: "2024-10-08", realized: 2, unrealized: 131, unrealizedDelta: 1 },
      ];

      const result = calcWtdMtdYtdFromSnapshots(daily, "2024-10-08");

      expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
      expect(result.wtd).toBeNaN();
      expect(result.mtd).toBeNaN();
      expect(result.ytd).toBeNaN();
    },
  );

  test(
    "Case K: 首日快照存在但上一笔跨越多个交易日时退化",
    () => {
      const daily: DailyResult[] = [
        { date: "2024-09-26", realized: 0, unrealized: 100, unrealizedDelta: 0 },
        { date: "2024-10-01", realized: 2, unrealized: 110, unrealizedDelta: 10 },
        { date: "2024-10-02", realized: -1, unrealized: 111, unrealizedDelta: 1 },
        { date: "2024-10-07", realized: 4, unrealized: 120, unrealizedDelta: 9 },
        { date: "2024-10-08", realized: 3, unrealized: 124, unrealizedDelta: 4 },
      ];

      const result = calcWtdMtdYtdFromSnapshots(daily, "2024-10-08");

      expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
      expect(result.wtd).toBeNaN();
      expect(result.mtd).toBeNaN();
      expect(result.ytd).toBeNaN();
    },
  );

  test("Case D: ΔU 缺失触发退化分支", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const daily: DailyResult[] = [
      { date: "2024-02-25", realized: 0, unrealized: 50 },
      { date: "2024-03-01", realized: 5, unrealized: 50 },
      { date: "2024-03-02", realized: -2, unrealized: 50 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-03-02");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test("Case E: 无基线但首日带 ΔU 时仅统计窗口内变动", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const daily: DailyResult[] = [
      { date: "2025-09-23", realized: 0, unrealized: 200, unrealizedDelta: 200 },
      { date: "2025-09-24", realized: 10, unrealized: 180, unrealizedDelta: -20 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test("退化路径会标记 degraded 状态", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-02", realized: 5, unrealized: 90 },
      { date: "2025-09-03", realized: -3, unrealized: 91 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-03");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("首行缺失浮盈会标记退化", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-23", realized: 10, unrealized: Number.NaN as any },
      { date: "2025-09-24", realized: -3, unrealized: 120 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("缺少窗口前快照但已有持仓时不会把整段浮盈计入", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-24", realized: 0, unrealized: 500 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("缺少评估日快照会标记退化并返回 NaN", () => {
    const daily: DailyResult[] = [
      { date: "2024-09-22", realized: 5, unrealized: 10 },
      { date: "2024-09-23", realized: -2, unrealized: 8 },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2024-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  test("字符串输入与数字输入得到一致的窗口 PnL", () => {
    const numericDaily: DailyResult[] = [
      { date: "2024-05-31", realized: 0, unrealized: 120, unrealizedDelta: 0 },
      { date: "2024-06-03", realized: 5, unrealized: 130, unrealizedDelta: 10 },
      { date: "2024-06-04", realized: -2, unrealized: 135, unrealizedDelta: 5 },
      { date: "2024-06-05", realized: 4, unrealized: 140, unrealizedDelta: 5 },
    ];

    const stringDaily = numericDaily.map((row) => ({
      ...row,
      realized: String(row.realized),
      unrealized: String(row.unrealized),
      unrealizedDelta: String(row.unrealizedDelta ?? ""),
    })) as unknown as DailyResult[];

    const numericResult = calcWtdMtdYtdFromSnapshots(numericDaily, "2024-06-05");
    const stringResult = calcWtdMtdYtdFromSnapshots(stringDaily, "2024-06-05");

    expect(stringResult.wtd).toBeCloseTo(numericResult.wtd ?? 0, 10);
    expect(stringResult.mtd).toBeCloseTo(numericResult.mtd ?? 0, 10);
    expect(Number.isNaN(stringResult.ytd)).toBe(true);
    expect(Number.isNaN(numericResult.ytd)).toBe(true);
    expect(stringResult.degraded).toEqual(numericResult.degraded);
  });

  test("Case F: 无 ΔU 快照退化时仅统计窗口内变动", () => {
    const evalDate = "2025-01-03";
    const daily: DailyResult[] = [
      { date: "2025-01-02", realized: 5, unrealized: 10 },
      { date: "2025-01-03", realized: -2, unrealized: 20 },
    ];

    const snapshot = calcWtdMtdYtdFromSnapshots(daily, evalDate);
    const periods = computePeriods(daily, evalDate);

    expect(snapshot.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(snapshot.wtd).toBeNaN();
    expect(snapshot.mtd).toBeNaN();
    expect(snapshot.ytd).toBeNaN();
    expect(periods.M11).toBeGreaterThan(0);
    expect(periods.M12).toBeGreaterThan(0);
    expect(periods.M13).toBeGreaterThan(0);
  });

  test("空字符串浮盈会被视为缺失并触发退化", () => {
    const daily: DailyResult[] = [
      { date: "2025-09-23", realized: 3, unrealized: "   " as any },
      { date: "2025-09-24", realized: -1, unrealized: "" as any },
    ];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });
});
