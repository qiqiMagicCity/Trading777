#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics } from "@/app/lib/metrics";

type AnyRec = Record<string, any>;

// 从新/旧结构中抽取对比口径
function pickTotals(metrics: AnyRec) {
  const M4 = Number(metrics?.M4?.total ?? metrics?.M4 ?? 0);
  const M5_1 = Number(metrics?.M5?.behavior ?? metrics?.M5_1 ?? 0);
  const M5_2 = Number(metrics?.M5?.fifo ?? metrics?.M5_2 ?? 0);
  const realized = Number(metrics?.realized ?? (M4 + M5_2));
  const unrealized = Number(metrics?.unrealized ?? metrics?.M3 ?? 0);
  const M9 = Number(metrics?.M9?.total ?? metrics?.M9 ?? 0);
  const m6 = Number(metrics?.M6?.total ?? metrics?.M6 ?? 0);
  return { realized, unrealized, m6, M4, M5_1, M5_2, M9 };
}

// 简单容差判断
function nearlyEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// 复用 replay 的读文件工具（若不存在则内联一个安全读取）
function readTextIfExists(p: string): string | undefined {
  try { return fs.readFileSync(p, "utf8"); } catch { return undefined; }
}
function parseCsv(text?: string): any[] {
  // 空文本或不存在则返回空表，避免 TS “possibly undefined”
  if (!text || text.length === 0) return [];
  // 去除 UTF-8 BOM，再做行拆分
  const s = text.replace(/^\uFEFF/, "");
  const lines = s.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  // 使用解构拿到表头，避免对 lines[0] 的未定义访问告警
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];
  const headers = headerLine.split(",").map(h => h.trim());

  return dataLines.map((line) => {
    const cols = line.split(",").map(c => c.trim());
    const obj: Record<string, string> = {};
    // 列数不够时以空串兜底，避免 undefined
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      obj[key] = cols[i] ?? "";
    }
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

function loadRealPositions(): { symbol: string; qty: number; avgPrice: number }[] {
  const base = path.resolve(process.cwd(), "data/real");
  const json = readTextIfExists(path.join(base, "positions.json"));
  if (json) return JSON.parse(json);
  const csv = parseCsv(readTextIfExists(path.join(base, "positions.csv")));
  return csv.map(r => ({ symbol: r.symbol, qty: Number(r.qty), avgPrice: Number(r.price ?? r.avg ?? r.Avg ?? 0) }));
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

async function main() {
  const argv = process.argv.slice(2);
  const from = argv.find(a => a.startsWith("--from="))?.split("=")[1];
  const to   = argv.find(a => a.startsWith("--to="))?.split("=")[1];

  const trades = loadRealTrades();
  const prices = loadRealPrices();
  const positions = loadRealPositions();
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
  const summaryRows = ["| date | M4 | M5.2 | M9 |", "| --- | ---: | ---: | ---: |"];
  const m5Rows = ["| date | M5.1 | M5.2 |", "| --- | ---: | ---: |"];
  const diffRows = [
    "| date | exp.realized | cmp.realized | diff.r | exp.unrealized | cmp.unrealized | diff.u |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  // 构建全量价格映射
  const priceMap: Record<string, Record<string, number>> = {};
  for (const p of prices) {
    const sym = priceMap[p.symbol] ?? (priceMap[p.symbol] = {});
    sym[p.date] = p.close;
  }

  let tradesAccum: any[] = [];
  const dailySoFar: DailySnap[] = [];

  for (const d of dates) {
    const dayTrades = trades.filter(t => t.date === d);
    tradesAccum = tradesAccum.concat(dayTrades.map(t => ({ date: t.date, side: t.side, symbol: t.symbol, qty: t.qty, price: t.price })));
    const res = runAll(d, positions, tradesAccum, priceMap, { dailyResults: dailySoFar }, { evalDate: d });
    const result = normalizeMetrics(res);
    const computed = pickTotals(result);

    const snap = snaps.find(s => s.date === d) as DailySnap;
    const expected = pickTotals(snap);

    summaryRows.push(`| ${d} | ${computed.M4.toFixed(2)} | ${computed.M5_2.toFixed(2)} | ${computed.M9.toFixed(2)} |`);
    m5Rows.push(`| ${d} | ${computed.M5_1.toFixed(2)} | ${computed.M5_2.toFixed(2)} |`);

    const diffReal = computed.realized - expected.realized;
    const diffUnreal = computed.unrealized - expected.unrealized;
    diffRows.push(
      `| ${d} | ${expected.realized.toFixed(2)} | ${computed.realized.toFixed(2)} | ${diffReal.toExponential()} | ${expected.unrealized.toFixed(2)} | ${computed.unrealized.toFixed(2)} | ${diffUnreal.toExponential()} |`,
    );

    const diffs: string[] = [];
    if (!nearlyEqual(computed.realized, expected.realized)) {
      diffs.push(`realized: ${computed.realized} != ${expected.realized}`);
    }
    if (!nearlyEqual(computed.unrealized, expected.unrealized)) {
      diffs.push(`unrealized: ${computed.unrealized} != ${expected.unrealized}`);
    }
    if (!nearlyEqual(computed.m6, expected.m6)) {
      diffs.push(`M6: ${computed.m6} != ${expected.m6}`);
    }

    if (diffs.length) {
      mismatches.push(`[${d}] ${diffs.join('; ')}`);
      console.error("❌ Mismatch on", d, "\n  " + diffs.join("\n  "));
      process.exitCode = 1;
    } else {
      console.log("✅ Verified", d, "— all matched under tolerance.");
    }

    dailySoFar.push({ date: d, realized: computed.realized, unrealized: computed.unrealized });
  }

  const report = [
    "# Real Data Verify Report",
    "",
    `区间: ${from ?? dates[0]} ~ ${to ?? dates[dates.length-1]}`,
    "",
    "## Daily Totals (M4/M5.2/M9)",
    ...summaryRows,
    "",
    "## M5 Breakdown",
    ...m5Rows,
    "",
    "## Expected vs Computed",
    ...diffRows,
    "",
    `总天数: ${dates.length}`,
    `不一致天数: ${mismatches.length}`,
    "",
    ...(mismatches.length ? ["## 差异明细", ...mismatches] : ["所有日期均一致。"]),
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
