import {
  compareOfficialSourcePriority,
  isHigherPriority,
  normalizeOfficialSourceTag,
} from "@/app/lib/prices/compareOfficialSourcePriority";

describe("normalizeOfficialSourceTag", () => {
  it("normalizes legacy import tags and whitespace", () => {
    expect(normalizeOfficialSourceTag("import")).toBe("official/import");
    expect(normalizeOfficialSourceTag(" Official / Import ")).toBe("official/import");
    expect(normalizeOfficialSourceTag("OFFICIAL_IMPORT")).toBe("official/import");
  });

  it("keeps manual/vendor/exchange with canonical prefix", () => {
    expect(normalizeOfficialSourceTag("official/manual")).toBe("official/manual");
    expect(normalizeOfficialSourceTag("Manual")).toBe("official/manual");
    expect(normalizeOfficialSourceTag("official vendor")).toBe("official/vendor");
    expect(normalizeOfficialSourceTag("OFFICIAL-EXCHANGE")).toBe("official/exchange");
  });

  it("keeps packaged tag", () => {
    expect(normalizeOfficialSourceTag("official/packaged")).toBe("official/packaged");
    expect(normalizeOfficialSourceTag("PACKAGED")).toBe("official/packaged");
  });

  it("downgrades blank and unknown values", () => {
    expect(normalizeOfficialSourceTag(" ")).toBe("unknown");
    expect(normalizeOfficialSourceTag("???")).toBe("unknown");
  });
});

describe("compareOfficialSourcePriority", () => {
  it("orders manual/vendor/exchange/import above packaged and others", () => {
    const sorted = [
      "fallback/rt",
      "official/packaged",
      "official/manual",
      "official/vendor",
      "official/import",
      "official/exchange",
    ].sort(compareOfficialSourcePriority);
    expect(sorted).toEqual([
      "official/manual",
      "official/vendor",
      "official/import",
      "official/exchange",
      "official/packaged",
      "fallback/rt",
    ]);
  });

  it("treats normalized tags as equal priority", () => {
    expect(compareOfficialSourcePriority("import", "official/import")).toBe(0);
    expect(compareOfficialSourcePriority("official manual", "manual")).toBe(0);
  });

  it("keeps unknown tags at lowest priority", () => {
    expect(compareOfficialSourcePriority("unknown", "official/packaged")).toBe(1);
    expect(compareOfficialSourcePriority("official/manual", "mystery"))
      .toBe(-1);
  });
});

describe("isHigherPriority", () => {
  it("returns true when new source outranks existing", () => {
    expect(isHigherPriority("official/manual", "official/packaged")).toBe(true);
    expect(isHigherPriority("official/import", "fallback/anything")).toBe(true);
  });

  it("returns false when existing is higher or equal", () => {
    expect(isHigherPriority("official/packaged", "official/manual")).toBe(false);
    expect(isHigherPriority("manual", "official/manual")).toBe(false);
  });
});
