#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics } from "@/app/lib/metrics";

// 复用 replay 的读文件工具（若不存在则内联一个安全读取）
function readTextIfExists(p: string): string | undefined {
  try { return fs.readFileSync(p, "utf8"); } catch { return undefined; }
}
function parseCsv(text?: string): any[] {
  if (!text) return [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
}

// 加载真实数据（CSV/JSON 二选一）
function loadRealTrades(): any[] {
  const base = path.resolve(process.cwd(), "data/real");
  const json = readTextIfExists(path.join(base, "trades.json"));
  if (json) return JSON.parse(json);
  const csv = parseCsv(readTextIfExists(path.join(base, "trades.csv")));
  // 统一字段：date,time,symbol,side,qty,price
  return csv.map(r => ({
    date: r.date, time: r.time, symbol: r.symbol,
    side: r.side, qty: Number(r.qty), price: Number(r.price)
  }));
}
function loadRealPrices(): any[] {
  const base = path.resolve(process.cwd(), "data/real");
  const json = readTextIfExists(path.join(base, "prices.json"));
  if (json) return JSON.parse(json);
  const csv = parseCsv(readTextIfExists(path.join(base, "prices.csv")));
  return csv.map(r => ({ date: r.date, symbol: r.symbol, close: Number(r.close) }));
}

type DailySnap = { date: string; realized: number; unrealized: number; M6?: number; [k:string]: any };
function loadDailyResult(): DailySnap[] {
  const base = path.resolve(process.cwd(), "data/real");
  const text = readTextIfExists(path.join(base, "dailyResult.json"));
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

// 取区间
function pickDates(snap: DailySnap[], from?: string, to?: string): string[] {
  const dates = Array.from(new Set(snap.map(r => r.date))).sort();
  const ok = dates.filter(d => (!from || d >= from) && (!to || d <= to));
  return ok;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

async function main() {
  const argv = process.argv.slice(2);
  const from = argv.find(a => a.startsWith("--from="))?.split("=")[1];
  const to   = argv.find(a => a.startsWith("--to="))?.split("=")[1];

  const trades = loadRealTrades();
  const prices = loadRealPrices();
  const snaps  = loadDailyResult();

  if (trades.length === 0 && prices.length === 0 && snaps.length === 0) {
    console.log("real-data-verify: 没有发现 data/real/*，跳过校验（视为通过）。");
    process.exit(0);
  }

  if (snaps.length === 0) {
    console.error("real-data-verify: 缺少 data/real/dailyResult.json，请先运行回放：npm run backtest -w web -- --from=YYYY-MM-DD --to=YYYY-MM-DD");
    process.exit(2);
  }

  const dates = pickDates(snaps, from, to);
  const mismatches: string[] = [];

  for (const d of dates) {
    // 过滤出当日数据
    const dayTrades = trades.filter(t => t.date === d);
    const dayPrices = prices.filter(p => p.date === d);
    // 基于当日重算
    const res = runAll({ trades: dayTrades, prices: dayPrices });
    const m = normalizeMetrics(res);
    const realize = round2(m.M4.total + m.M5.fifo);
    const unrl   = round2(m.M3);
    const m6     = round2(m.M6.total);

    const snap = snaps.find(s => s.date === d) as DailySnap;
    const sRealized   = round2(Number(snap?.realized ?? NaN));
    const sUnrealized = round2(Number(snap?.unrealized ?? NaN));
    const sM6         = round2(Number(snap?.M6 ?? snap?.total ?? NaN)); // 兼容字段

    const okReal = realize === sRealized;
    const okUnrl = unrl === sUnrealized;
    const okM6   = m6 === sM6;

    if (!(okReal && okUnrl && okM6)) {
      mismatches.push(
        `[${d}] realized: ${realize} != ${sRealized}; unrealized: ${unrl} != ${sUnrealized}; M6: ${m6} != ${sM6}`
      );
    }
  }

  // 写报告
  const report = [
    "# Real Data Verify Report",
    "",
    `区间: ${from ?? dates[0]} ~ ${to ?? dates[dates.length-1]}`,
    `总天数: ${dates.length}`,
    `不一致天数: ${mismatches.length}`,
    "",
    ...(mismatches.length ? ["## 差异明细", ...mismatches] : ["所有日期均一致。"])
  ].join("\n");

  const out = path.resolve(process.cwd(), "data/real/verify-report.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, report, "utf8");

  if (mismatches.length) {
    console.error("real-data-verify: 存在不一致，详见 data/real/verify-report.md");
    process.exit(1);
  } else {
    console.log("real-data-verify: 校验通过 ✔");
  }
}
main().catch(e => { console.error(e); process.exit(2); });
