import fs from "fs";
import path from "path";

const targets = [
  path.resolve(__dirname, "../../modules/DashboardMetrics.tsx"),
  path.resolve(__dirname, "../../modules/PositionsTable.tsx"),
  path.resolve(__dirname, "../../page.tsx"),
].filter((filePath) => fs.existsSync(filePath));

const forbiddenPatterns = [
  /toISOString\(\)\.slice\(0,\s*10\)/,
  /new\s+Date\s*\(\s*d\.date\s*\)/,
  /new\s+Date\s*\(\s*["']\d{4}-\d{2}-\d{2}["']\s*\)/,
  /Intl\.DateTimeFormat\((?:(?!timeZone\s*:\s*["']America\/New_York["']).)*\)/s,
];

describe("frontend static guard: enforce trading-day authority", () => {
  test("modules import authority helpers and avoid risky constructs", () => {
    for (const file of targets) {
      const source = fs.readFileSync(file, "utf8");
      const hasAuthorityImport =
        /from ['"]\.\.\/lib\/TradingDayContext['"]/.test(source) ||
        /from ['"]\.\.\/lib\/nyDay['"]/.test(source) ||
        /from ['"]\.\/lib\/TradingDayContext['"]/.test(source) ||
        /from ['"]\.\/lib\/nyDay['"]/.test(source);

      expect(hasAuthorityImport).toBe(true);

      for (const rule of forbiddenPatterns) {
        expect(source).not.toMatch(rule);
      }
    }
  });
});
