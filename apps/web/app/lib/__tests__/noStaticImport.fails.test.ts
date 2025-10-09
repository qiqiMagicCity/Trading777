import { execSync } from "node:child_process";

describe("close_prices static import guard", () => {
  it("does not allow static imports of close_prices.json", () => {
    try {
      execSync(
        "rg --files-with-matches '(import|require)\\([^\\n]*close_prices\\.json' --glob '!apps/web/app/lib/__tests__/noStaticImport.fails.test.ts' --glob '!node_modules/**' .",
        { stdio: "pipe" },
      );
      throw new Error("静态引用 close_prices.json 应该不存在");
    } catch (error: any) {
      if (error && typeof error.status === "number" && error.status === 1) {
        return;
      }
      throw error;
    }
  });
});
