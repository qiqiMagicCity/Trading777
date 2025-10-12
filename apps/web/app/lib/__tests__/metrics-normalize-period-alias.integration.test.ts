import { normalizeMetrics } from "@/app/lib/metrics";

describe("normalizeMetrics period alias handling", () => {
  it("ignores legacy WTD/MTD/YTD aliases and leaves period fields empty", () => {
    const result = normalizeMetrics({
      WTD: "123.45",
      MTD: 67,
      periods: {
        ytd: "89.01",
      },
    });

    expect("M11" in result).toBe(false);
    expect("M12" in result).toBe(false);
    expect("M13" in result).toBe(false);
  });

  it("prefers explicit M11/M12/M13 over legacy aliases when both exist", () => {
    const result = normalizeMetrics({
      M11: 11,
      M12: 12,
      M13: 13,
      WTD: 100,
      MTD: 200,
      YTD: 300,
      periods: {
        M11: 111,
        M12: 222,
        M13: 333,
      },
    });

    expect(result.M11).toBe(11);
    expect(result.M12).toBe(12);
    expect(result.M13).toBe(13);
  });

  it("drops NaN period inputs so downstream UI can treat them as missing", () => {
    const result = normalizeMetrics({
      M11: Number.NaN,
      periods: { M12: "NaN", M13: "   " },
      MTD: "NaN",
    });

    expect("M11" in result).toBe(false);
    expect("M12" in result).toBe(false);
    expect("M13" in result).toBe(false);
  });
});
