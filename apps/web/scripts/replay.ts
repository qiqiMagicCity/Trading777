import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import runAll, { RawTrade, ClosePriceMap } from "../app/lib/runAll";
import type { InitialPosition } from "../app/lib/fifo";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

function readJSON(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readTrades(p: string): RawTrade[] {
  const txt = fs.readFileSync(p, "utf8").trim();
  if (p.endsWith(".json")) {
    const data = JSON.parse(txt);
    return Array.isArray(data) ? data : [];
  }
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  lines.shift();
  return lines.map((l) => {
    const [date, side, symbol, qty, price] = l.split(",");
    return {
      date,
      side: side as RawTrade["side"],
      symbol,
      qty: Number(qty),
      price: Number(price),
    };
  });
}

function readPrices(p: string): ClosePriceMap {
  const txt = fs.readFileSync(p, "utf8").trim();
  const map: ClosePriceMap = {};
  if (p.endsWith(".json")) {
    const data = JSON.parse(txt);
    if (Array.isArray(data)) {
      for (const r of data) {
        const { date, symbol, price } = r;
        if (!map[symbol]) map[symbol] = {};
        map[symbol][date] = Number(price);
      }
    } else {
      return data;
    }
  } else {
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    lines.shift();
    for (const l of lines) {
      const [date, symbol, price] = l.split(",");
      if (!map[symbol]) map[symbol] = {};
      map[symbol][date] = Number(price);
    }
  }
  return map;
}

function genDates(from: string, to: string): string[] {
  const res: string[] = [];
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    res.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return res;
}

const args = process.argv.slice(2);
const from = args.find((a) => a.startsWith("--from="))?.slice(7);
const to = args.find((a) => a.startsWith("--to="))?.slice(5);

const positions: InitialPosition[] = readJSON(
  path.join(publicDir, "initial_positions.json"),
);

if (from && to) {
  const dataDir = path.resolve(__dirname, "../data/real");
  const tradeFile = ["trades.json", "trades.csv"]
    .map((f) => path.join(dataDir, f))
    .find((f) => fs.existsSync(f));
  const priceFile = ["prices.json", "prices.csv"]
    .map((f) => path.join(dataDir, f))
    .find((f) => fs.existsSync(f));

  const allTrades = tradeFile ? readTrades(tradeFile) : [];
  const closePrices: ClosePriceMap = priceFile ? readPrices(priceFile) : {};

  const dates = genDates(from, to);
  let trades: RawTrade[] = [];
  const dailyResults: { date: string; realized: number; unrealized: number }[] = [];
  const output: any[] = [];

  for (const date of dates) {
    const dayTrades = allTrades.filter((t) => t.date === date);
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
    const { M1, M2, M3, M4, M5_1, M5_2, M6, M7, M8, M9, M10, M11, M12, M13 } = res as any;
    output.push({
      date,
      realized,
      unrealized,
      M1,
      M2,
      M3,
      M4,
      M5_1,
      M5_2,
      M6,
      M7,
      M8,
      M9,
      M10,
      M11,
      M12,
      M13,
    });
  }

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "dailyResult.json"),
    JSON.stringify(output, null, 2),
  );
  console.log(`replay generated ${output.length} days`);
} else {
  const dataDir = path.resolve(__dirname, "../data/snapshots");
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
}
