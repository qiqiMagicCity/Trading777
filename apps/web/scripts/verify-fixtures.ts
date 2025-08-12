import fs from "node:fs";
import path from "node:path";
import { runAll, type HistPos, type Trade } from "../app/lib/runAll";

type PriceMap = Record<string, number>;

function loadJSON<T=any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function listFixtureDays(root: string): string[] {
  return fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

function toRunAllTrade(t: any): Trade {
  const side = (t.side || t.type || "").toUpperCase();
  return { t: t.date || t.t, sym: t.sym || t.symbol, type: side, qty: Math.abs(t.qty), price: t.price };
}

function toHistPos(p: any): HistPos {
  const side = (p.side || "").toUpperCase();
  return { sym: p.sym || p.symbol, side, qty: Math.abs(p.qty), price: p.price ?? p.cost, cost: p.cost ?? p.price };
}

function cmpMoney(a: number, b: number) { return Math.abs(a - b) <= 0.01; }

async function main() {
  const root = path.resolve(process.cwd(), "tests/fixtures/multiday");
  if (!fs.existsSync(root)) {
    console.error("No fixtures directory:", root);
    process.exit(1);
  }

  let hist: HistPos[] = [];
  let failed = false;

  for (const day of listFixtureDays(root)) {
    const dir = path.join(root, day);
    const tradesRaw = loadJSON<any>(path.join(dir, "trades.json"));
    const prices    = loadJSON<PriceMap>(path.join(dir, "close_prices.json"));
    const expectedPath = path.join(dir, "expected.metrics.json");
    const hasExpected = fs.existsSync(expectedPath);
    const expected = hasExpected ? loadJSON<any>(expectedPath) : {};

    const trades: Trade[] = (tradesRaw.trades || []).map(toRunAllTrade);
    // Merge initial positions for this day (if provided)
    const initPos: HistPos[] = (tradesRaw.positions || []).map(toHistPos);
    if (initPos.length) hist = hist.concat(initPos);

    const result = runAll(hist, trades, prices);

    // Build hist for next day from openLots
    hist = result.openLots.map((o:any) => ({ sym:o.sym, side:o.side, qty:o.qty, cost:o.cost }));

    // Invariants from runAll (if present) should already be consistent.
    // Compare expected keys (partial-key compare)
    if (hasExpected) {
      const pairs: Array<[string, number, number]> = [
        ["M3",      result.M3.total,  expected["M3"]],
        ["M4",      result.M4.total,  expected["M4"]],
        ["M5.fifo", result.M5.fifoRealized, expected["M5.fifo"]],
        ["M6",      result.M6.total,  expected["M6"]],
        ["M9",      Number((result.M4.total + result.M5.fifoRealized).toFixed(2)), expected["M9"]],
      ].filter(([, , exp]) => typeof exp === "number");

      for (const [k, got, exp] of pairs) {
        if (!cmpMoney(got, exp)) {
          console.error(`[${day}] Expected ${k}=${exp}, got ${got}`);
          failed = true;
        }
      }
    }

    // Shadow diffs must be empty
    const diff = result.shadowDiff || {};
    const diffKeys = Object.keys(diff);
    if (diffKeys.length) {
      console.error(`[${day}] shadow diff:`, diff);
      failed = true;
    }

    console.log(`[OK] ${day}`);
  }

  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
