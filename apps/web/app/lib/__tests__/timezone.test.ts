import {
  getLatestTradingDayStr,
  monthStartNY,
  weekStartNY,
  yearStartNY,
  toNY,
  ymdInNY,
} from "../timezone";

describe("getLatestTradingDayStr", () => {
  it("keeps Monday pre-market on the same trading day", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-06T08:00:00-04:00"))).toBe(
      "2024-05-06",
    );
  });

  it("returns same day during market hours", () => {
    expect(getLatestTradingDayStr(new Date("2024-05-06T10:00:00-04:00"))).toBe(
      "2024-05-06",
    );
  });

  it("keeps same trading day during late evening", () => {
    expect(getLatestTradingDayStr(new Date("2025-10-01T22:48:00-04:00"))).toBe(
      "2025-10-01",
    );
  });

  it("stays on same calendar day after midnight before open", () => {
    expect(getLatestTradingDayStr(new Date("2025-10-01T00:05:00-04:00"))).toBe(
      "2025-10-01",
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
    const monday = new Date("2024-03-11T08:00:00-04:00");
    expect(getLatestTradingDayStr(monday)).toBe("2024-03-11");
  });

  it("handles daylight saving time end", () => {
    const monday = new Date("2024-11-04T08:00:00-05:00");
    expect(getLatestTradingDayStr(monday)).toBe("2024-11-04");
  });
});

describe("start-of-period formatting", () => {
  it("keeps week start on same day for YYYY-MM-DD input", () => {
    expect(weekStartNY("2024-05-06")).toBe("2024-05-06");
  });

  it("keeps week start consistent for late-evening trades", () => {
    expect(weekStartNY(new Date("2024-05-08T20:30:00-04:00"))).toBe(
      "2024-05-06",
    );
  });

  it("keeps month start on same day for YYYY-MM-DD input", () => {
    expect(monthStartNY("2024-05-06")).toBe("2024-05-01");
  });

  it("keeps year start on same day for YYYY-MM-DD input", () => {
    expect(yearStartNY("2024-05-06")).toBe("2024-01-01");
  });
});

describe("ymdInNY boundaries", () => {
  it("returns same date for 23:59:59 ET", () => {
    expect(ymdInNY("2024-05-06T23:59:59-04:00")).toBe("2024-05-06");
  });

  it("returns same date for 00:00:00 ET", () => {
    expect(ymdInNY("2024-05-06T00:00:00-04:00")).toBe("2024-05-06");
  });

  it("handles DST spring forward", () => {
    expect(ymdInNY("2024-03-10T02:30:00-04:00")).toBe("2024-03-10");
  });

  it("handles DST fall back", () => {
    expect(ymdInNY("2024-11-03T01:30:00-05:00")).toBe("2024-11-03");
  });

  it("maps late evening trades back to the same New York day", () => {
    expect(ymdInNY("2025-01-15T01:30:00Z")).toBe("2025-01-14");
  });

  it("keeps post-DST trades on their calendar day", () => {
    expect(ymdInNY("2025-03-09T06:30:00Z")).toBe("2025-03-09");
  });

  it("shifts pre-DST trades to the prior calendar day", () => {
    expect(ymdInNY("2025-03-09T04:30:00Z")).toBe("2025-03-08");
  });
});
