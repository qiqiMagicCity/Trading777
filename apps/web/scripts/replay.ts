import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import runAll, { RawTrade, ClosePriceMap } from "../app/lib/runAll";
import type { InitialPosition } from "../app/lib/fifo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readCSV(p: string) {
  const text = fs.readFileSync(p, "utf8").trim();
  if (!text) return [] as any[];
  const [head, ...lines] = text.split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim());
  return lines
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      const obj: Record<string, string> = {};
      cols.forEach((c, i) => (obj[c] = parts[i]));
      return obj;
    });
}

function readTrades(file: string): RawTrade[] {
  if (!fs.existsSync(file)) return [];
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") {
    const arr = readJSON(file);
    return Array.isArray(arr)
      ? arr.map((t: any) => ({
          date: String(t.date || ""),
          side: String(t.side || "").toUpperCase(),
          symbol: String(t.symbol || ""),
          qty: Number(t.qty ?? t.quantity ?? 0),
          price: Number(t.price ?? 0),
        }))
      : [];
  }
  if (ext === ".csv") {
    return readCSV(file).map((t: any) => ({
      date: String(t.date || ""),
      side: String(t.side || "").toUpperCase(),
      symbol: String(t.symbol || ""),
      qty: Number(t.qty ?? 0),
      price: Number(t.price ?? 0),
    }));
  }
  return [];
}

function readPrices(file: string): Record<string, number> {
  if (!fs.existsSync(file)) return {};
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") {
    const data = readJSON(file);
    const out: Record<string, number> = {};
    if (Array.isArray(data)) {
      for (const p of data) {
        if (p?.symbol) out[p.symbol] = Number(p.price ?? 0);
      }
    } else {
      for (const [sym, price] of Object.entries(data)) {
        out[sym] = Number(price);
      }
    }
    return out;
  }
  if (ext === ".csv") {
    const rows = readCSV(file);
    const out: Record<string, number> = {};
    for (const r of rows) {
      if (r.symbol) out[r.symbol] = Number(r.price ?? 0);
    }
    return out;
  }
  return {};
}

function parseArgs() {
  const args = process.argv.slice(2);
  const res: { from?: string; to?: string } = {};
  for (const a of args) {
    if (a.startsWith("--from=")) res.from = a.slice(7);
    if (a.startsWith("--to=")) res.to = a.slice(5);
  }
  return res;
}

const { from, to } = parseArgs();

const dataDir = path.resolve(__dirname, "../data/real");
const tradesDir = path.join(dataDir, "trades");
const pricesDir = path.join(dataDir, "prices");
const outFile = path.join(dataDir, "dailyResult.json");

const publicDir = path.resolve(__dirname, "../public");

const positions: InitialPosition[] = readJSON(
  path.join(publicDir, "initial_positions.json"),
);

const closePrices: ClosePriceMap = {};

const dateSet = new Set<string>();

if (fs.existsSync(tradesDir)) {
  for (const f of fs.readdirSync(tradesDir)) {
    const m = f.match(/(\d{4}-\d{2}-\d{2})\.[a-z]+$/);
    if (m) dateSet.add(m[1]);
  }
}
if (fs.existsSync(pricesDir)) {
  for (const f of fs.readdirSync(pricesDir)) {
    const m = f.match(/(\d{4}-\d{2}-\d{2})\.[a-z]+$/);
    if (m) dateSet.add(m[1]);
  }
}

let dates = Array.from(dateSet).sort();
if (from) dates = dates.filter((d) => d >= from);
if (to) dates = dates.filter((d) => d <= to);

let trades: RawTrade[] = [];
const dailyResults: any[] = [];

for (const date of dates) {
  const tradeFileJson = path.join(tradesDir, `${date}.json`);
  const tradeFileCsv = path.join(tradesDir, `${date}.csv`);
  const dayTrades = readTrades(
    fs.existsSync(tradeFileJson) ? tradeFileJson : tradeFileCsv,
  );
  trades = trades.concat(dayTrades);

  const priceFileJson = path.join(pricesDir, `${date}.json`);
  const priceFileCsv = path.join(pricesDir, `${date}.csv`);
  const dayPrices = readPrices(
    fs.existsSync(priceFileJson) ? priceFileJson : priceFileCsv,
  );
  for (const [sym, price] of Object.entries(dayPrices)) {
    closePrices[sym] = closePrices[sym] || {};
    closePrices[sym][date] = price;
  }

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
  const { aux, ...metrics } = res as any;
  dailyResults.push({ date, realized, unrealized, ...metrics });
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(dailyResults, null, 2));

console.log(`replay generated ${dailyResults.length} days`);

