import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import runAll, { RawTrade, ClosePriceMap } from "../app/lib/runAll";
import type { InitialPosition } from "../app/lib/fifo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function parseCSV(content: string) {
  return content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(",").map((s) => s.trim()));
}

function loadTrades(dir: string): RawTrade[] {
  const json = path.join(dir, "trades.json");
  const csv = path.join(dir, "trades.csv");
  if (fs.existsSync(json)) {
    const data = readJSON(json);
    return Array.isArray(data) ? data : [];
  }
  if (fs.existsSync(csv)) {
    const rows = parseCSV(fs.readFileSync(csv, "utf8"));
    const header = rows.shift()?.map((h) => h.toLowerCase()) || [];
    const idxDate = header.indexOf("date");
    const idxSide = header.indexOf("side");
    const idxSymbol = header.indexOf("symbol");
    const idxQty = header.indexOf("qty");
    const idxPrice = header.indexOf("price");
    const list: RawTrade[] = [];
    for (const cols of rows) {
      const date = cols[idxDate];
      const side = cols[idxSide];
      const symbol = cols[idxSymbol];
      const qty = Number(cols[idxQty]);
      const price = Number(cols[idxPrice]);
      if (!date || !side || !symbol) continue;
      list.push({
        date,
        side: side.toUpperCase() as RawTrade["side"],
        symbol,
        qty,
        price,
      });
    }
    return list;
  }
  return [];
}

function loadPrices(dir: string): ClosePriceMap {
  const json = path.join(dir, "prices.json");
  const csv = path.join(dir, "prices.csv");
  if (fs.existsSync(json)) {
    const data = readJSON(json);
    if (Array.isArray(data)) {
      const map: ClosePriceMap = {};
      for (const row of data) {
        const { symbol, date, price, close } = row as any;
        const p = Number(price ?? close);
        if (!symbol || !date || isNaN(p)) continue;
        (map[symbol] ||= {})[date] = p;
      }
      return map;
    }
    return data as ClosePriceMap;
  }
  if (fs.existsSync(csv)) {
    const rows = parseCSV(fs.readFileSync(csv, "utf8"));
    const header = rows.shift()?.map((h) => h.toLowerCase()) || [];
    const idxDate = header.indexOf("date");
    const idxSymbol = header.indexOf("symbol");
    const priceIdx = header.indexOf("price");
    const idxPrice = priceIdx === -1 ? header.indexOf("close") : priceIdx;
    const map: ClosePriceMap = {};
    for (const cols of rows) {
      const date = cols[idxDate];
      const symbol = cols[idxSymbol];
      const price = Number(cols[idxPrice]);
      if (!date || !symbol || isNaN(price)) continue;
      (map[symbol] ||= {})[date] = price;
    }
    return map;
  }
  return {};
}

function getArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function enumerateDates(from: string, to: string) {
  const res: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    res.push(d.toISOString().slice(0, 10));
  }
  return res;
}

const dataDir = path.resolve(__dirname, "../data/real");
const publicDir = path.resolve(__dirname, "../public");

const positions: InitialPosition[] = fs.existsSync(
  path.join(publicDir, "initial_positions.json"),
)
  ? readJSON(path.join(publicDir, "initial_positions.json"))
  : [];

const allTrades = loadTrades(dataDir).sort((a, b) => a.date.localeCompare(b.date));
const closePrices: ClosePriceMap = loadPrices(dataDir);

const fromArg = getArg("from");
const toArg = getArg("to");

const dateSet = new Set<string>();
for (const t of allTrades) dateSet.add(t.date.slice(0, 10));
for (const symbol of Object.keys(closePrices)) {
  for (const d of Object.keys(closePrices[symbol])) dateSet.add(d);
}
const allDates = Array.from(dateSet).sort();
const from = fromArg ?? allDates[0];
const to = toArg ?? allDates[allDates.length - 1];

const dates = from && to ? enumerateDates(from, to).filter((d) => dateSet.has(d)) : [];

let trades: RawTrade[] = [];
let idx = 0;
const dailyResults: { date: string; realized: number; unrealized: number }[] = [];
const outputs: any[] = [];

for (const date of dates) {
  while (idx < allTrades.length && allTrades[idx].date.slice(0, 10) <= date) {
    trades.push(allTrades[idx]);
    idx++;
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
  dailyResults.push({ date, realized, unrealized });
  const { aux, ...metrics } = res as any;
  outputs.push({ date, realized, unrealized, ...metrics });
}

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(
  path.join(dataDir, "dailyResult.json"),
  JSON.stringify(outputs, null, 2),
);

console.log(`backtest generated ${outputs.length} days`);

