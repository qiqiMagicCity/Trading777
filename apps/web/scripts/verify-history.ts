import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runAll, RawTrade, ClosePriceMap } from "../app/lib/runAll";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const dataDir = path.resolve(__dirname, "../data/snapshots");
const publicDir = path.resolve(__dirname, "../public");

const positions = readJSON(path.join(publicDir, "initial_positions.json"));
const closePrices: ClosePriceMap = readJSON(
  path.join(publicDir, "close_prices.json"),
);

const dates = fs
  .readdirSync(dataDir)
  .filter((d) => /\d{4}-\d{2}-\d{2}/.test(d))
  .sort();

let trades: RawTrade[] = [];
let dailyResults: { date: string; realized: number; unrealized: number }[] = [];

for (const date of dates) {
  const dayDir = path.join(dataDir, date);
  const dayTrades: RawTrade[] = readJSON(path.join(dayDir, "trades.json"));
  trades = trades.concat(dayTrades);

  const res = await runAll(
    date,
    positions,
    trades,
    closePrices,
    { dailyResults },
    { evalDate: date },
  );
  const realized = Math.round((res.M4 + res.M5_2) * 100) / 100;
  const unrealized = Math.round(res.M3 * 100) / 100;

  const snapshotDaily = readJSON(path.join(dayDir, "dailyResult.json"));
  const record = snapshotDaily.find((r: any) => r.date === date);
  if (!record) {
    throw new Error(`missing dailyResult for ${date}`);
  }
  const tol = 0.01;
  if (
    Math.abs(record.realized - realized) > tol ||
    Math.abs(record.unrealized - unrealized) > tol
  ) {
    throw new Error(`mismatch on ${date}`);
  }

  dailyResults.push({ date, realized, unrealized });
}

console.log("✅ history verified");
