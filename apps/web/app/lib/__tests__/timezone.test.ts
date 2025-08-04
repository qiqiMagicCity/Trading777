import { getLatestTradingDayStr } from "../timezone";

describe("getLatestTradingDayStr", () => {
  it("returns previous Friday before market open on Monday", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-06T08:00:00-04:00"))).toBe(
      "2024-05-03",
    );
  });

  it("returns same day during market hours", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-06T10:00:00-04:00"))).toBe(
      "2024-05-06",
    );
  });
});
