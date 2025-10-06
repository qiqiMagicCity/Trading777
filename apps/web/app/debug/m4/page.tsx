import { promises as fs } from "fs";
import path from "path";
import type { Metadata } from "next";
import React from "react";
import { runAll, normalizeClosePriceMap, type RawTrade } from "@/app/lib/runAll";
import type { InitialPosition } from "@/app/lib/fifo";
import { round2 } from "@/app/lib/money";
import { getLatestTradingDayStr } from "@/lib/timezone";

type SearchParamsShape = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: Promise<SearchParamsShape>;
};

type PersistedTrade = {
  symbol?: unknown;
  price?: unknown;
  quantity?: unknown;
  qty?: unknown;
  date?: unknown;
  action?: unknown;
  time?: unknown;
};

type PersistedPosition = {
  symbol?: unknown;
  qty?: unknown;
  quantity?: unknown;
  avgPrice?: unknown;
  price?: unknown;
};

type PersistedDailyResult = {
  date?: unknown;
  realized?: unknown;
  unrealized?: unknown;
  unrealizedDelta?: unknown;
  realized_today?: unknown;
};

type MinimalDailyResult = {
  date?: string;
  realized?: number | string | null;
  unrealized?: number | string | null;
  unrealizedDelta?: number | string | null;
  realized_today?: number | string | null;
};

type Dataset = {
  trades: RawTrade[];
  positions: InitialPosition[];
  closePrices: ReturnType<typeof normalizeClosePriceMap>;
  dailyResults: MinimalDailyResult[];
};

type M4Leg = {
  symbol?: string;
  fillId?: string;
  time?: string;
  action?: string;
  qty?: number;
  lotDateStr?: string;
  from?: "history" | "today" | string;
  into?: string;
  pnl_raw?: number;
};

type Breakdown = {
  all: M4Leg[];
  m4: M4Leg[];
};

type RunAllOutput = Awaited<ReturnType<typeof runAll>>;

type JsonRecord = Record<string, unknown>;

export const metadata: Metadata = {
  title: "M4 Breakdown Debug",
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

async function readPublicJson<T>(file: string, fallback: T): Promise<T> {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "apps", "web", "public", file),
    path.join(cwd, "public", file),
  ];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, "utf8");
      return JSON.parse(content) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  return fallback;
}

const toRawTrade = (entry: unknown): RawTrade | null => {
  if (!isRecord(entry)) return null;
  const action = parseString(entry.action)?.toUpperCase();
  if (!action || !["BUY", "SELL", "SHORT", "COVER"].includes(action)) return null;
  const symbol = parseString(entry.symbol)?.toUpperCase();
  if (!symbol) return null;
  const price = parseNumber(entry.price);
  const quantity = parseNumber(entry.quantity ?? entry.qty);
  if (price === null || quantity === null) return null;
  const date = parseString(entry.time) ?? parseString(entry.date);
  if (!date) return null;
  return {
    date,
    side: action as RawTrade["side"],
    symbol,
    qty: quantity,
    price,
  };
};

const toInitialPosition = (entry: unknown): InitialPosition | null => {
  if (!isRecord(entry)) return null;
  const symbol = parseString(entry.symbol)?.toUpperCase();
  const qty = parseNumber(entry.qty ?? entry.quantity);
  const avgPrice = parseNumber(entry.avgPrice ?? entry.price);
  if (!symbol || qty === null || avgPrice === null) return null;
  return { symbol, qty, avgPrice };
};

const toDailyResult = (entry: unknown): MinimalDailyResult | null => {
  if (!isRecord(entry)) return null;
  const date = parseString(entry.date);
  if (!date) return null;
  const realized = entry.realized ?? entry.realized_today;
  return {
    date,
    realized: typeof realized === "number" || typeof realized === "string" ? realized : null,
    unrealized:
      typeof entry.unrealized === "number" || typeof entry.unrealized === "string"
        ? entry.unrealized
        : null,
    unrealizedDelta:
      typeof entry.unrealizedDelta === "number" || typeof entry.unrealizedDelta === "string"
        ? entry.unrealizedDelta
        : null,
    realized_today:
      typeof entry.realized_today === "number" || typeof entry.realized_today === "string"
        ? entry.realized_today
        : null,
  };
};

const loadDataset = async (): Promise<Dataset> => {
  const tradesJson = await readPublicJson<unknown>("trades.json", []);
  const tradesSource = Array.isArray(tradesJson)
    ? tradesJson
    : isRecord(tradesJson) && Array.isArray(tradesJson.trades)
    ? tradesJson.trades
    : [];
  const trades = tradesSource
    .map((row) => toRawTrade(row))
    .filter((row): row is RawTrade => row !== null);

  const positionsJson = await readPublicJson<unknown>("positions.json", []);
  const positionsSource = Array.isArray(positionsJson) ? positionsJson : [];
  const positions = positionsSource
    .map((row) => toInitialPosition(row))
    .filter((row): row is InitialPosition => row !== null);

  const pricesJson = await readPublicJson<unknown>("prices.json", {});
  const closePrices = normalizeClosePriceMap(pricesJson);

  const dailyJson = await readPublicJson<unknown>("dailyResult.json", []);
  const dailyResultsSource = Array.isArray(dailyJson) ? dailyJson : [];
  const dailyResults = dailyResultsSource
    .map((row) => toDailyResult(row))
    .filter((row): row is MinimalDailyResult => row !== null);

  return { trades, positions, closePrices, dailyResults };
};

const asLeg = (value: unknown): M4Leg | null => {
  if (!isRecord(value)) return null;
  const leg: M4Leg = {
    symbol: parseString(value.symbol)?.toUpperCase(),
    fillId: parseString(value.fillId) ?? undefined,
    time: parseString(value.time) ?? undefined,
    action: parseString(value.action)?.toUpperCase(),
    qty: parseNumber(value.qty) ?? undefined,
    lotDateStr: parseString(value.lotDateStr) ?? undefined,
    from: parseString(value.from)?.toLowerCase() as M4Leg["from"],
    into: parseString(value.into)?.toUpperCase(),
    pnl_raw: parseNumber(value.pnl_raw ?? value.pnl) ?? undefined,
  };
  return leg;
};

const extractBreakdown = (result: RunAllOutput): Breakdown => {
  const bucket = result?.aux?.breakdown as unknown;
  if (Array.isArray(bucket)) {
    const all = bucket.map((row) => asLeg(row)).filter((row): row is M4Leg => row !== null);
    const m4 = all.filter((row) => row.into === "M4");
    return { all, m4 };
  }

  if (isRecord(bucket)) {
    const all = Array.isArray(bucket.all)
      ? bucket.all.map((row) => asLeg(row)).filter((row): row is M4Leg => row !== null)
      : [];
    const m4 = Array.isArray(bucket.m4)
      ? bucket.m4.map((row) => asLeg(row)).filter((row): row is M4Leg => row !== null)
      : all.filter((row) => row.into === "M4");
    return { all, m4 };
  }

  return { all: [], m4: [] };
};

const formatSymbol = (symbol: string | undefined): string => symbol ?? "—";

const formatFrom = (from: M4Leg["from"] | undefined): string => {
  if (!from) return "—";
  return from === "history" || from === "today" ? from : String(from);
};

export default async function DebugM4Page({ searchParams }: PageProps) {
  const resolvedParams = (searchParams ? await searchParams : undefined) ?? {};
  const rawSymbol = resolvedParams.symbol;
  const symbolParam = Array.isArray(rawSymbol) ? rawSymbol[0] : rawSymbol;
  const normalizedSymbol = typeof symbolParam === "string" ? symbolParam.trim().toUpperCase() : "";

  const rawDate = resolvedParams.date;
  const dateParam = Array.isArray(rawDate) ? rawDate[0] : rawDate;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const evalDate = typeof dateParam === "string" && datePattern.test(dateParam)
    ? dateParam
    : getLatestTradingDayStr();

  if (!normalizedSymbol) {
    return (
      <div className="p-4">
        在地址栏添加 <code>?symbol=TSLA</code> 查看；例如：<code>?symbol=AAPL</code>
      </div>
    );
  }

  const { trades, positions, closePrices, dailyResults } = await loadDataset();
  const evalDateObj = new Date(`${evalDate}T16:00:00-05:00`);
  const result = await runAll(
    evalDate,
    positions,
    trades,
    closePrices,
    { dailyResults },
    { evalDate: evalDateObj },
  );

  const { all, m4 } = extractBreakdown(result);
  const filteredLegs = all.filter((leg) => !normalizedSymbol || leg.symbol === normalizedSymbol);
  const sumAll = round2(all.reduce((acc, leg) => acc + Number(leg.pnl_raw ?? 0), 0));
  const sumFiltered = round2(filteredLegs.reduce((acc, leg) => acc + Number(leg.pnl_raw ?? 0), 0));
  const m4Value = round2(Number(result.M4 ?? 0));
  const diff = Math.abs(sumAll - m4Value);
  const withinTolerance = diff <= 0.01;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">M4 Breakdown 调试 — {normalizedSymbol}</h1>
      <div className="space-y-1 text-sm text-slate-600">
        <p>
          当前交易日：<span className="font-medium text-slate-900">{evalDate}</span>
        </p>
        <p>
          过滤标的：
          <span className="font-medium text-slate-900">{normalizedSymbol || "全部标的"}</span>
        </p>
        <p className="text-xs text-slate-500">
          可通过 ?symbol=TSLA 或 ?symbol=TSLA&amp;date=2024-01-02 调整筛选范围。
        </p>
      </div>

      <div className="space-y-1">
        <div>
          result.M4：<b>{m4Value.toFixed(2)}</b>
        </div>
        <div>
          sum(all legs pnl_raw)：<b>{sumAll.toFixed(2)}</b>{" "}
          <span className={withinTolerance ? "text-green-600" : "text-red-600"}>
            {withinTolerance ? "(匹配)" : `(|diff|=${diff.toFixed(2)})`}
          </span>
        </div>
        <div>
          当前筛选合计：<b>{sumFiltered.toFixed(2)}</b>（{filteredLegs.length} 条腿）
        </div>
        <div className="text-xs text-slate-500">
          断言：全量腿 sum(pnl_raw) ≈ result.M4（误差 ≤ $0.01），单个标的仅用于辅助排查。
        </div>
        <div className="text-xs text-slate-500">
          历史腿计数：{m4.length}（断言：from 应全部为 history）。
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border px-2 py-1 text-left">symbol</th>
              <th className="border px-2 py-1 text-left">fillId</th>
              <th className="border px-2 py-1 text-left">time</th>
              <th className="border px-2 py-1 text-left">action</th>
              <th className="border px-2 py-1 text-right">qty</th>
              <th className="border px-2 py-1 text-left">lotDateStr</th>
              <th className="border px-2 py-1 text-left">from</th>
              <th className="border px-2 py-1 text-right">pnl_raw</th>
            </tr>
          </thead>
          <tbody>
            {filteredLegs.map((leg, index) => (
              <tr key={`${leg.fillId ?? "?"}-${leg.time ?? "na"}-${index}`}>
                <td className="border px-2 py-1">{formatSymbol(leg.symbol)}</td>
                <td className="border px-2 py-1">{leg.fillId ?? "—"}</td>
                <td className="border px-2 py-1">{leg.time ?? "—"}</td>
                <td className="border px-2 py-1">{leg.action ?? "—"}</td>
                <td className="border px-2 py-1 text-right">{leg.qty ?? 0}</td>
                <td className="border px-2 py-1">{leg.lotDateStr ?? "—"}</td>
                <td className="border px-2 py-1">{formatFrom(leg.from)}</td>
                <td className="border px-2 py-1 text-right">{(leg.pnl_raw ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
