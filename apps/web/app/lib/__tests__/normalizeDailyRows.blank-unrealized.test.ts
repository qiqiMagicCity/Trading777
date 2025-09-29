import { normalizeDailyRows } from "../runAll";

describe("normalizeDailyRows", () => {
  it("会忽略空白浮盈并保留有效数值", () => {
    const evalDate = "2025-09-24";
    const rows = normalizeDailyRows(
      [
        { date: "2025-09-23", realized: 2, unrealized: "   " as any },
        { date: "2025-09-24", realized: 1, unrealized: "  45.5  " as any },
      ],
      evalDate,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.unrealized).toBeUndefined();
    expect(rows[1]?.unrealized).toBeCloseTo(45.5);
  });

  it("可以解析带千分位的浮盈与 ΔU", () => {
    const evalDate = "2025-09-26";
    const rows = normalizeDailyRows(
      [
        {
          date: "2025-09-25",
          realized: 10,
          unrealized: "26,030.56" as any,
          unrealizedDelta: "1,234.5" as any,
        },
      ],
      evalDate,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.unrealized).toBeCloseTo(26030.56);
    expect(rows[0]?.unrealizedDelta).toBeCloseTo(1234.5);
  });
});
