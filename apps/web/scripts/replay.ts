import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runAll, RawTrade, ClosePriceMap, getReplayDays, normalizeClosePriceMap } from "../app/lib/runAll";
import { normalizeMetrics } from "@/app/lib/metrics";
import type { InitialPosition } from "../app/lib/fifo";
import { nyDateStr } from "../app/lib/time";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(p: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

const publicDir = path.resolve(__dirname, "../public");

const argv = process.argv.slice(2);
const from = argv.find(a => a.startsWith("--from="))?.split("=")[1] ?? "";
const to   = argv.find(a => a.startsWith("--to="))?.split("=")[1] ?? "";
if (!from || !to) {
  console.error("usage: replay --from=YYYY-MM-DD --to=YYYY-MM-DD");
  process.exit(1);
}

const positions: InitialPosition[] = readJSON(path.join(publicDir, "positions.json"), []);
const allTrades: RawTrade[] = readJSON(path.join(publicDir, "trades.json"), []);
const rawPrices = readJSON(path.join(publicDir, "prices.json"), {});
const prices: ClosePriceMap = normalizeClosePriceMap(rawPrices);

const days = getReplayDays(from, to, allTrades, prices);

const existing: any[] = readJSON(path.join(publicDir, "dailyResult.json"), []);
const map = new Map<string, any>(existing.map(r => [r.date, r]));

const dailyResults: { date: string; realized: number; unrealized: number; M6: number }[] = [];
for (const day of days) {
  const relevantTrades = allTrades.filter(t => nyDateStr(t.date) <= day);
  const res = await runAll(day, positions, relevantTrades, prices, { dailyResults }, { evalDate: day });
  const m = normalizeMetrics(res);
  const totalRealized = m.M4.total + m.M5.fifo;
  const prevRealized = dailyResults.reduce((s, r) => s + r.realized, 0);
  const realized = Math.round((totalRealized - prevRealized) * 100) / 100;
  const unrealized = Math.round(m.M3 * 100) / 100;
  const M6 = m.M6.total;
  const record = { date: day, realized, unrealized, M6 };
  dailyResults.push(record);
  map.set(day, record);
}

const out = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(path.join(publicDir, "dailyResult.json"), JSON.stringify(out, null, 2));

console.log(`replay generated ${days.length} days`);
