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
});
