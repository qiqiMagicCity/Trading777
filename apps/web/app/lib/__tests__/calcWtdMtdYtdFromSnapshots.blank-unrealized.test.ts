import { calcWtdMtdYtdFromSnapshots } from "../metrics";
import { __internal } from "../runAll";

describe("calcWtdMtdYtdFromSnapshots blank unrealized handling", () => {
  it("treats blank unrealized as missing and degrades the window", () => {
    const daily = [
      {
        date: "2025-09-24",
        realized: "",
        unrealized: " ",
      },
    ] as unknown as Parameters<typeof calcWtdMtdYtdFromSnapshots>[0];

    const result = calcWtdMtdYtdFromSnapshots(daily, "2025-09-24");

    expect(result.degraded).toEqual({ wtd: true, mtd: true, ytd: true });
    expect(result.wtd).toBeNaN();
    expect(result.mtd).toBeNaN();
    expect(result.ytd).toBeNaN();
  });

  it("omits blank unrealized values when normalizing daily rows", () => {
    const rows = __internal.normalizeDailyRows(
      [
        { date: "2025-09-24", realized: "0", unrealized: "" },
        { date: "2025-09-25", realized: "1", unrealized: "   " },
        { date: "2025-09-26", realized: "2", unrealized: "3" },
      ],
      "2025-09-26",
    );

    expect(rows).toEqual([
      { day: "2025-09-24", realized: 0 },
      { day: "2025-09-25", realized: 1 },
      { day: "2025-09-26", realized: 2, unrealized: 3 },
    ]);
  });
});
