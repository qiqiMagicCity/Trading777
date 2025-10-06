import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const root = join(process.cwd(), "apps/web/app/lib");
const offenders = [];
const pattern = /\bas\s+(?:unknown\s+as\s+)?DailyResult(?:Input)?(?:\s*\[\])?/;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    if (pattern.test(text)) {
      offenders.push(full);
    }
  }
}

walk(root);

if (offenders.length > 0) {
  console.error(
    "检测到直接将 DailyResult(Input) 形态断言传入 calcMetricsInternal 可能路径:",
  );
  for (const file of offenders) {
    console.error(" -", file);
  }
  process.exit(1);
}

console.log("calcMetrics daily results assertions check passed.");
