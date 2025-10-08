import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTradingDayStr } from "../app/lib/nyDay";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const snapshotRoot = path.resolve(__dirname, "../data/snapshots");

const freezeRaw = process.env.NEXT_PUBLIC_FREEZE_DATE;
const date = resolveTradingDayStr(undefined, { freeze: freezeRaw || undefined });
const destDir = path.join(snapshotRoot, date);

fs.mkdirSync(destDir, { recursive: true });

for (const name of ["trades.json", "dailyResult.json"]) {
  const src = path.join(publicDir, name);
  if (!fs.existsSync(src)) {
    console.warn(`${name} not found in public dir, skipping`);
    continue;
  }
  fs.copyFileSync(src, path.join(destDir, name));
}

console.log(`Snapshot saved to ${destDir}`);
