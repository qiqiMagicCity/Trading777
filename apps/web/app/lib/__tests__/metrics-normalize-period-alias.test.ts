import { normalizeMetrics } from "@/app/lib/metrics";

describe("normalizeMetrics period alias handling", () => {
  it("uses WTD/MTD/YTD aliases when M11/M12/M13 are missing", () => {
    const result = normalizeMetrics({
      WTD: "123.45",
      MTD: 67,
      periods: {
        ytd: "89.01",
      },
    });

    expect(result.M11).toBeCloseTo(123.45);
    expect(result.M12).toBe(67);
    expect(result.M13).toBeCloseTo(89.01);
  });

  it("prefers explicit M11/M12/M13 over aliases", () => {
    const result = normalizeMetrics({
      M11: 11,
      M12: 12,
      M13: 13,
      WTD: 100,
      MTD: 200,
      YTD: 300,
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

  it("does not fallback to legacy WTD when degraded", () => {
    const result = normalizeMetrics({
      M11: Number.NaN,
      periods: { WTD: 26030.56 },
      _period: { degraded: { wtd: true } },
    });

    expect("M11" in result).toBe(false);
  });
});
