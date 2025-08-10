import { readFileSync } from "fs";
import path from "path";

describe("dailyResult.json records", () => {
  it("include exactly date, realized, and unrealized", () => {
    const file = path.join(__dirname, "../../../public/dailyResult.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(Array.isArray(data)).toBe(true);
    for (const record of data) {
      expect(Object.keys(record).sort()).toEqual([
        "date",
        "realized",
        "unrealized",
      ]);
    }
  });
});
