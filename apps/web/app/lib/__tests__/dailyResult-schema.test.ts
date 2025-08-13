import { readFileSync } from "fs";
import path from "path";

describe("dailyResult.json records", () => {
  it("include required date, realized, unrealized and optional unrealizedDelta", () => {
    const file = path.join(__dirname, "../../../public/dailyResult.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    expect(Array.isArray(data)).toBe(true);
    for (const record of data) {
      const keys = Object.keys(record).sort();
      if (keys.includes("unrealizedDelta")) {
        expect(keys).toEqual([
          "date",
          "realized",
          "unrealized",
          "unrealizedDelta",
        ]);
      } else {
        expect(keys).toEqual(["date", "realized", "unrealized"]);
      }
    }
  });
});
