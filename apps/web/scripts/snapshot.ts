import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nyDateStr } from "../app/lib/time";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");
const snapshotRoot = path.resolve(__dirname, "../data/snapshots");

const date = process.env.NEXT_PUBLIC_FREEZE_DATE || nyDateStr(new Date());
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
