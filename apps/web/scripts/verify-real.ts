import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { runAll, type HistPos, type Trade } from "../app/lib/runAll";

interface RawTrade {
  date: string;
  side: string;
  symbol: string;
  qty: number;
  price: number;
}

interface DailyResultRecord {
  date: string;
  realized: number;
  unrealized: number;
}

const THRESH = 1e-2;

function shadowCalc(result: ReturnType<typeof runAll>) {
  return {
    realized: result.M4.total + result.M5.fifoRealized,
    unrealized: result.M3.total,
  };
}

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
    },
  });
  const dir = values.dir ? path.resolve(values.dir) : process.cwd();

  const tradesPath = path.join(dir, "trades.json");
  const pricesPath = path.join(dir, "close_prices.json");
  const dailyPath = path.join(dir, "dailyResult.json");
  const initPosPath = path.join(dir, "initial_positions.json");

  const tradesRaw = loadJson<RawTrade[]>(tradesPath);
  const pricesRaw = loadJson<Record<string, Record<string, number>>>(pricesPath);
  const dailyResults = loadJson<DailyResultRecord[]>(dailyPath);

  let hist: HistPos[] = [];
  if (fs.existsSync(initPosPath)) {
    const init = loadJson<Array<{ symbol: string; qty: number; avgPrice: number }>>(initPosPath);
    hist = init.map((p) => ({
      sym: p.symbol,
      side: p.qty >= 0 ? "LONG" : "SHORT",
      qty: Math.abs(p.qty),
      price: p.avgPrice,
    }));
  }

  let failed = false;
  for (const dr of dailyResults.sort((a, b) => a.date.localeCompare(b.date))) {
    const dayTrades: Trade[] = tradesRaw
      .filter((t) => t.date?.startsWith(dr.date))
      .map((t) => ({
        t: t.date,
        sym: t.symbol,
        type: t.side.toUpperCase() as Trade["type"],
        qty: Math.abs(t.qty),
        price: t.price,
      }));

    const priceMap: Record<string, number> = {};
    for (const [sym, map] of Object.entries(pricesRaw)) {
      const px = map[dr.date];
      if (typeof px === "number") priceMap[sym] = px;
    }

    const result = runAll(hist, dayTrades, priceMap);
    const shadow = shadowCalc(result);

    const diffRealized = shadow.realized - dr.realized;
    const diffUnrealized = shadow.unrealized - dr.unrealized;

    if (Math.abs(diffRealized) > THRESH || Math.abs(diffUnrealized) > THRESH) {
      console.error("daily result diff", {
        date: dr.date,
        diffRealized,
        diffUnrealized,
        expected: dr,
        shadow,
      });
      failed = true;
    }

    if (Math.abs(result.invariants.m1Recalc - result.M1.total) > THRESH) {
      console.error("M1 invariant mismatch", {
        date: dr.date,
        m1Recalc: result.invariants.m1Recalc,
        m1Total: result.M1.total,
      });
      failed = true;
    }
    if (!result.invariants.closedQtyConsistency) {
      console.error("closedQtyConsistency failed", { date: dr.date });
      failed = true;
    }
    if (Math.abs(result.invariants.realizedConsistencyDiff) > THRESH) {
      console.error("realizedConsistencyDiff too large", {
        date: dr.date,
        diff: result.invariants.realizedConsistencyDiff,
      });
      failed = true;
    }

    hist = result.openLots.map((o) => ({ sym: o.sym, side: o.side, qty: o.qty, cost: o.cost }));
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

