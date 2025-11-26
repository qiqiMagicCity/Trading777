import "fake-indexeddb/auto";
import { strict as assert } from "assert";

import closePriceSeed from "@/../public/close_prices.json";
import { closePricesFromRows, mergeClosePriceMaps, normalizeClosePriceMap } from "@/app/lib/dailyResults";
import { summarizeMissingOfficialCloses } from "@/app/lib/missingOfficialClose";
import { overlayEntriesToMap, readOfficialCloseOverlay } from "@/app/lib/officialCloseOverlayStore";
import { evaluateCloseWindow } from "@/app/lib/marketHours";
import { isOfficialCloseSource } from "@/app/lib/priceSourceGuards";
import { requireOfficialClose, setOfficialCloseContext } from "@/app/lib/price/requireOfficialClose";
import { createMissingOfficialCloseDiagnostics } from "@/app/lib/diagnostics/reportMissingOfficialClose";
import { explainClose } from "@/app/lib/diagnostics/explainMissingClose";
import {
  clearAllData,
  closeDb,
  getAllPrices,
  getPrice,
  importClosePrices,
} from "@/app/lib/services/dataService";

const GROUPS: Record<string, string[]> = {
  "2025-09-19": ["AMD", "BA", "DIS", "GOOGL", "NVDL", "PYPL", "TSDD", "UAL"],
  "2025-10-03": ["AMZN", "APP", "BA", "DIS", "GOOGL", "INTC", "PYPL", "SCHW", "UAL"],
  "2025-10-06": ["BA", "DIS", "GOOGL", "PYPL", "UAL", "AMZN", "INTC"],
};

const ALL_SYMBOLS = Array.from(new Set(Object.values(GROUPS).flat()));

async function seedClosePrices() {
  await clearAllData();
  await importClosePrices(closePriceSeed as Record<string, Record<string, number>>);
}

async function buildHomeOfficialContext() {
  const [cachedRows, overlayEntries] = await Promise.all([
    getAllPrices(),
    readOfficialCloseOverlay(),
  ]);
  const overlayMap = overlayEntriesToMap(overlayEntries);
  const normalizedFileCloses = normalizeClosePriceMap(
    closePriceSeed as Record<string, Record<string, number>>,
  );
  const cachedOfficialCloses = closePricesFromRows(
    cachedRows.filter((row) => isOfficialCloseSource(row.source)),
  );
  const cachedFallbackCloses = closePricesFromRows(
    cachedRows.filter((row) => !isOfficialCloseSource(row.source)),
  );
  const officialCloseMap = mergeClosePriceMaps(
    overlayMap,
    normalizedFileCloses,
    cachedOfficialCloses,
  );
  const mergedCloseMap = mergeClosePriceMaps(
    cachedFallbackCloses,
    overlayMap,
    normalizedFileCloses,
    cachedOfficialCloses,
  );
  return {
    overlay: overlayMap,
    official: officialCloseMap,
    merged: mergedCloseMap,
    fallback: cachedFallbackCloses,
  };
}

async function getHomeBannerMissing(evalDates: string[]): Promise<Record<string, string[]>> {
  const { overlay, official, fallback } = await buildHomeOfficialContext();
  const diagnostics = createMissingOfficialCloseDiagnostics();
  const now = new Date("2025-10-10T20:00:00Z");
  const release = setOfficialCloseContext({
    map: official,
    overlayMap: overlay,
    diagnostics,
    fallbackResolver: (symbol, date) => Boolean(fallback[symbol]?.[date]),
    closeWindowEvaluator: (date) => evaluateCloseWindow(date, now).inWindow,
  });
  try {
    for (const date of evalDates) {
      const symbols = GROUPS[date] ?? [];
      for (const symbol of symbols) {
        requireOfficialClose(symbol, date, "M6");
      }
    }
  } finally {
    release();
  }
  const summaries = summarizeMissingOfficialCloses(
    diagnostics.missingOfficialCloses,
  );
  const result: Record<string, string[]> = {};
  for (const summary of summaries) {
    if (!evalDates.includes(summary.ymd)) continue;
    result[summary.ymd] = summary.symbols.map((item) => item.symbol).sort();
  }
  for (const date of evalDates) {
    result[date] = (result[date] ?? []).sort();
  }
  return result;
}

async function scanMissingStrict(evalDates: string[]): Promise<Record<string, string[]>> {
  const output: Record<string, string[]> = {};
  for (const date of evalDates) {
    const missing: string[] = [];
    const symbols = GROUPS[date] ?? [];
    for (const symbol of symbols) {
      const explain = await explainClose(symbol, date);
      if (explain.verdict === "MISSING") {
        missing.push(symbol);
      }
    }
    output[date] = missing.sort();
  }
  return output;
}

async function readOfficialCloseFromStore(symbol: string, date: string) {
  const rec = await getPrice(symbol, date);
  if (!rec) return null;
  return { price: rec.close, source: rec.source };
}

describe("黄条仍在：根因追踪", () => {
  const evalDates = Object.keys(GROUPS);

  beforeAll(async () => {
    await seedClosePrices();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("A) 首页黄条 vs 诊断页：缺口集合对齐", async () => {
    const home = await getHomeBannerMissing(evalDates);
    const diag = await scanMissingStrict(evalDates);
    const diff = evalDates.map((date) => ({
      date,
      home: [...(home[date] ?? [])],
      diag: [...(diag[date] ?? [])],
    }));
    console.log("BANNER_vs_DIAG", JSON.stringify(diff, null, 2));
  });

  it("B) 逐项核对价格真实存在性/来源/日期漂移", async () => {
    const findings: any[] = [];
    for (const [date, symbols] of Object.entries(GROUPS)) {
      for (const symbol of symbols) {
        const query = async (d: string) => {
          const rec = await readOfficialCloseFromStore(symbol, d);
          if (!rec) return { exists: false };
          const ok = Number.isFinite(rec.price);
          const src = rec.source ?? "unknown";
          const official = isOfficialCloseSource(src);
          return { exists: ok, price: rec.price, source: src, official };
        };

        const current = await query(date);
        const prevDate = new Date(date);
        prevDate.setDate(prevDate.getDate() - 1);
        const prev = await query(prevDate.toISOString().slice(0, 10));
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const next = await query(nextDate.toISOString().slice(0, 10));

        let cause = "unknown";
        if (current.exists && current.official) cause = "MERGE_PATH_BUG";
        else if (current.exists && !current.official) cause = "SOURCE_MISCLASSIFIED";
        else if (!current.exists && (prev.exists || next.exists)) cause = "DATE_DRIFT";
        else cause = "ACTUALLY_MISSING_OR_CACHE";

        findings.push({
          date,
          symbol,
          cur: current,
          neighbor: { prev, next },
          cause,
        });
      }
    }
    const summary = findings.reduce((map: Record<string, number>, item) => {
      map[item.cause] = (map[item.cause] ?? 0) + 1;
      return map;
    }, {} as Record<string, number>);
    console.log("CAUSE_SUMMARY", summary);
    console.log("FINDINGS", JSON.stringify(findings, null, 2));
  });

  it("C) 环境与模式检查（严格口径）", async () => {
    console.log("SAFE_PRICE_MODE=", process.env.SAFE_PRICE_MODE || "(undefined)");
    assert.ok(ALL_SYMBOLS.length > 0);
  });
});
