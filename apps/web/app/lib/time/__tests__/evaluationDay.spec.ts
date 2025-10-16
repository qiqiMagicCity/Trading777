process.env.TZ = 'America/New_York';

import { beforeOfficialClose, isTradingDay, pickEvaluationDay } from "../evaluationDay";
import { toNY } from "@/app/lib/timezone";

const toDate = (iso: string) => toNY(iso);

describe("evaluationDay helpers", () => {
  it("picks trading day for regular trading hours", () => {
    const now = new Date("2025-03-03T20:00:00Z");
    expect(pickEvaluationDay(now)).toBe("2025-03-03");
  });

  it("identifies weekend as non-trading day", () => {
    const sat = toDate("2025-03-01T12:00:00-05:00");
    expect(isTradingDay(sat)).toBe(false);
  });

  it("detects before close during normal session", () => {
    const fifteenFiftyNine = toDate("2025-03-03T15:59:00-05:00");
    expect(isTradingDay(fifteenFiftyNine)).toBe(true);
    expect(beforeOfficialClose(fifteenFiftyNine)).toBe(true);
  });

  it("detects after close during normal session", () => {
    const sixteen = toDate("2025-03-03T16:00:00-05:00");
    expect(beforeOfficialClose(sixteen)).toBe(false);
  });

  it("handles half-day close at 13:00", () => {
    const early = toDate("2024-11-29T12:30:00-05:00");
    const afterEarlyClose = toDate("2024-11-29T13:00:00-05:00");
    expect(isTradingDay(early)).toBe(true);
    expect(beforeOfficialClose(early)).toBe(true);
    expect(beforeOfficialClose(afterEarlyClose)).toBe(false);
  });
});
