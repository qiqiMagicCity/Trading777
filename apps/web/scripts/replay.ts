import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import runAll, { RawTrade, ClosePriceMap } from "../app/lib/runAll";
import type { InitialPosition } from "../app/lib/fifo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const dataDir = path.resolve(__dirname, "../data/snapshots");
const publicDir = path.resolve(__dirname, "../public");

const positions: InitialPosition[] = readJSON(
  path.join(publicDir, "initial_positions.json"),
);
const closePrices: ClosePriceMap = readJSON(
  path.join(publicDir, "close_prices.json"),
);

const dates = fs.existsSync(dataDir)
  ? fs
      .readdirSync(dataDir)
      .filter((d) => /\d{4}-\d{2}-\d{2}/.test(d))
      .sort()
  : [];

let trades: RawTrade[] = [];
const dailyResults: { date: string; realized: number; unrealized: number }[] = [];

for (const date of dates) {
  const dayDir = path.join(dataDir, date);
  const tradePath = path.join(dayDir, "trades.json");
  if (!fs.existsSync(tradePath)) continue;
  const dayTrades: RawTrade[] = readJSON(tradePath);
  trades = trades.concat(dayTrades);

  const res = runAll(
    date,
    positions,
    trades,
    closePrices,
    { dailyResults },
    { evalDate: date },
  );

  const realized = Math.round((res.M4 + res.M5_2) * 100) / 100;
  const unrealized = Math.round(res.M3 * 100) / 100;
  dailyResults.push({ date, realized, unrealized });
}

fs.writeFileSync(
  path.join(publicDir, "dailyResult.json"),
  JSON.stringify(dailyResults, null, 2),
);

console.log(`replay generated ${dailyResults.length} days`);
