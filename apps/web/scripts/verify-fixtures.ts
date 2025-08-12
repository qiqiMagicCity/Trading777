import fs from "node:fs";
import path from "node:path";
import { runAll, type HistPos, type Trade } from "../app/lib/runAll";

type PriceMap = Record<string, number>;

function loadJSON<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function listFixtureDays(root: string): string[] {
  return fs.readdirSync(root).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}

function toRunAllTrade(t: any): Trade {
  const side = String(t.side || t.type || "").toUpperCase();
  return { t: t.date || t.t, sym: t.sym || t.symbol, type: side as Trade["type"], qty: Math.abs(t.qty), price: t.price };
}

function toHistPos(p: any): HistPos {
  const side = String(p.side || "").toUpperCase();
  return { sym: p.sym || p.symbol, side: side as HistPos["side"], qty: Math.abs(p.qty), cost: p.cost ?? p.price };
}

function r2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function eqMoney(a?: number, b?: number) { return typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 0.01; }

(async () => {
  const root = path.resolve(process.cwd(), "tests/fixtures/multiday");
  if (!fs.existsSync(root)) {
    console.error("No fixtures dir:", root);
    process.exit(1);
  }

  let hist: HistPos[] = [];
  let failed = false;

  for (const day of listFixtureDays(root)) {
    const dir = path.join(root, day);
    const tradesRaw = loadJSON<any>(path.join(dir, "trades.json"));
    const prices = loadJSON<PriceMap>(path.join(dir, "close_prices.json"));
    const expectedPath = path.join(dir, "expected.metrics.json");
    const hasExpected = fs.existsSync(expectedPath);
    const expected = hasExpected ? loadJSON<any>(expectedPath) : {};

    // 当天若提供 positions，则视为权威起点（重置历史）；否则沿用上一日 openLots
    const initPos: HistPos[] = (tradesRaw.positions || []).map(toHistPos);
    if (initPos.length) hist = initPos;

    const trades: Trade[] = (tradesRaw.trades || []).map(toRunAllTrade);

    const result: any = runAll(hist, trades, prices);

    // 为下一日准备 openLots（若返回了的话）
    if (Array.isArray(result.openLots)) {
      hist = result.openLots.map((o: any) => ({ sym: o.sym, side: o.side, qty: o.qty, cost: o.cost }));
    }

    // 取各指标（兼容对象/数字两种形态）
    const M3got = typeof result.M3 === "number" ? result.M3 : result.M3?.total;
    const M4got = typeof result.M4 === "number" ? result.M4 : result.M4?.total;
    const M5fifo = result.M5?.fifoRealized ?? result.M5?.fifo ?? result["M5.fifo"];
    const M6got = typeof result.M6 === "number" ? result.M6 : result.M6?.total;
    const M9got = r2((Number(M4got) || 0) + (Number(M5fifo) || 0));

    if (hasExpected) {
      const checks: Array<[string, number | undefined, number | undefined]> = [
        ["M3", M3got, expected["M3"]],
        ["M4", M4got, expected["M4"]],
        ["M5.fifo", M5fifo, expected["M5.fifo"]],
        ["M6", M6got, expected["M6"]],
        ["M9", M9got, expected["M9"]],
      ].filter(([, , exp]) => typeof exp === "number");

      for (const [k, got, exp] of checks) {
        if (!eqMoney(got, exp)) {
          console.error(`[${day}] Expected ${k}=${exp}, got ${got}`);
          failed = true;
        }
      }
    }

    // shadow 对拍必须无差异（如存在）
    const diff = result.shadowDiff || {};
    const diffKeys = Object.keys(diff);
    if (diffKeys.length) {
      console.error(`[${day}] shadow diff:`, diff);
      failed = true;
    }

    if (!failed) console.log(`[OK] ${day}`);
  }

  if (failed) process.exit(1);
})();
