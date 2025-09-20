import { getLatestTradingDayStr, toNY } from "../timezone";

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

  it("keeps same trading day during late evening", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-17T20:57:00-04:00"))).toBe(
      "2024-05-17",
    );
  });

  it("carries Friday forward through the weekend", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-18T20:00:00-04:00"))).toBe(
      "2024-05-17",
    );
  });
});

describe("DST transitions", () => {
  it("handles daylight saving time start", () => {
    const monday = toNY("2024-03-11T08:00:00");
    expect(getLatestTradingDayStr(monday)).toBe("2024-03-08");
  });

  it("handles daylight saving time end", () => {
    const monday = toNY("2024-11-04T08:00:00");
    expect(getLatestTradingDayStr(monday)).toBe("2024-11-01");
  });
});
