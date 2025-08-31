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
  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i];
    });
    return obj;
  });
}

function readTradesFromFile(p: string): RawTrade[] {
  if (!p) return [];
  if (p.endsWith(".json")) return readJSON(p);
  const rows = readCSV(p);
  return rows.map((r) => ({
    date: r.date,
    side: r.side as RawTrade["side"],
    symbol: r.symbol,
    qty: Number(r.qty),
    price: Number(r.price),
  }));
}

function readPricesFromFile(p: string): ClosePriceMap {
  if (!p) return {};
  if (p.endsWith(".json")) return readJSON(p);
  const rows = readCSV(p);
  const map: ClosePriceMap = {};
  for (const r of rows) {
    const symbol = r.symbol;
    const date = r.date;
    const price = Number(r.price);
    if (!map[symbol]) map[symbol] = {};
    map[symbol][date] = price;
  }
  return map;
}

function genDates(from: string, to: string): string[] {
  const res: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    res.push(d.toISOString().slice(0, 10));
  }
  return res;
}

const argMap: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) argMap[m[1]] = m[2];
}

const realDir = path.resolve(__dirname, "../data/real");
if (fs.existsSync(realDir)) {
  const tradesPath = fs.existsSync(path.join(realDir, "trades.json"))
    ? path.join(realDir, "trades.json")
    : fs.existsSync(path.join(realDir, "trades.csv"))
      ? path.join(realDir, "trades.csv")
      : "";
  const pricesPath = fs.existsSync(path.join(realDir, "prices.json"))
    ? path.join(realDir, "prices.json")
    : fs.existsSync(path.join(realDir, "prices.csv"))
      ? path.join(realDir, "prices.csv")
      : "";

  let allTrades = readTradesFromFile(tradesPath);
  const closePrices = readPricesFromFile(pricesPath);

  if (!allTrades.length || !Object.keys(closePrices).length) {
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(path.join(realDir, "dailyResult.json"), "[]");
    console.log("replay generated 0 days");
    process.exit(0);
  }

  allTrades.sort((a, b) => a.date.localeCompare(b.date));
  const start = argMap["from"] ?? allTrades[0].date;
  const end = argMap["to"] ?? allTrades[allTrades.length - 1].date;
  const dates = genDates(start, end);

  const publicDir = path.resolve(__dirname, "../public");
  const positions: InitialPosition[] = readJSON(
    path.join(publicDir, "initial_positions.json"),
  );

  let trades: RawTrade[] = [];
  const dailyResults: any[] = [];

  for (const date of dates) {
    trades = trades.concat(allTrades.filter((t) => t.date === date));
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

  fs.mkdirSync(realDir, { recursive: true });
  fs.writeFileSync(
    path.join(realDir, "dailyResult.json"),
    JSON.stringify(dailyResults, null, 2),
  );

  console.log(`replay generated ${dailyResults.length} days`);
} else {
  // Fallback to old snapshot replay (used by monitoring scripts)
  const snapDir = path.resolve(__dirname, "../data/snapshots");
  const publicDir = path.resolve(__dirname, "../public");

  const positions: InitialPosition[] = readJSON(
    path.join(publicDir, "initial_positions.json"),
  );
  const closePrices: ClosePriceMap = readJSON(
    path.join(publicDir, "close_prices.json"),
  );

  const dates = fs.existsSync(snapDir)
    ? fs
        .readdirSync(snapDir)
        .filter((d) => /\d{4}-\d{2}-\d{2}/.test(d))
        .sort()
    : [];

  let trades: RawTrade[] = [];
  const dailyResults: { date: string; realized: number; unrealized: number }[] = [];

  for (const date of dates) {
    const dayDir = path.join(snapDir, date);
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
}

