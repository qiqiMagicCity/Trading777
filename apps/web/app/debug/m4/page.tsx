import { promises as fs } from "fs";
import path from "path";
import { runAll, normalizeClosePriceMap, type RawTrade } from "@/app/lib/runAll";
import { round2 } from "@/app/lib/money";
import { getLatestTradingDayStr } from "@/lib/timezone";
import type { Metadata } from "next";
import type { InitialPosition } from "@/app/lib/fifo";

type SearchParams = {
  symbol?: string;
  date?: string;
};

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

type PersistedTrade = {
  symbol: string;
  price: number;
  quantity: number;
  date: string;
  action: string;
  time?: string;
};

async function readPublicJson(file: string): Promise<any> {
  const candidate = path.join(process.cwd(), "public", file);
  const resolved = candidate.includes(`${path.sep}apps${path.sep}web${path.sep}`)
    ? candidate
    : path.join(process.cwd(), "apps", "web", "public", file);
  const content = await fs.readFile(resolved, "utf8");
  return JSON.parse(content);
}

function toRawTrade(entry: PersistedTrade): RawTrade | null {
  if (!entry || typeof entry !== "object") return null;
  const action = String(entry.action ?? "").trim().toUpperCase();
  if (!action) return null;
  const symbol = String(entry.symbol ?? "").trim().toUpperCase();
  if (!symbol) return null;
  const price = Number(entry.price);
  const quantity = Number(entry.quantity ?? (entry as any).qty);
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) return null;
  const dateTime = typeof entry.time === "string" && entry.time
    ? entry.time
    : typeof entry.date === "string"
      ? entry.date
      : "";
  if (!dateTime) return null;
  if (action !== "BUY" && action !== "SELL" && action !== "SHORT" && action !== "COVER") {
    return null;
  }
  return {
    date: dateTime,
    side: action as RawTrade["side"],
    symbol,
    qty: quantity,
    price,
  };
}

async function loadDataset() {
  const tradesJson = await readPublicJson("trades.json");
  const tradesSource: unknown = Array.isArray(tradesJson)
    ? tradesJson
    : (tradesJson as any)?.trades;
  const trades: RawTrade[] = Array.isArray(tradesSource)
    ? tradesSource
        .map((row) => toRawTrade(row as PersistedTrade))
        .filter((row): row is RawTrade => Boolean(row))
    : [];

  const positionsJson = await readPublicJson("positions.json");
  const positions: InitialPosition[] = Array.isArray(positionsJson)
    ? positionsJson
        .map((row: any) => ({
          symbol: String(row?.symbol ?? "").trim().toUpperCase(),
          qty: Number(row?.qty ?? row?.quantity ?? 0),
          avgPrice: Number(row?.avgPrice ?? row?.price ?? 0),
        }))
        .filter(
          (row) =>
            row.symbol && Number.isFinite(row.qty) && Number.isFinite(row.avgPrice),
        )
    : [];

  const pricesJson = await readPublicJson("prices.json");
  const closePrices = normalizeClosePriceMap(pricesJson);

  const dailyJson = await readPublicJson("dailyResult.json");
  const dailyResults = Array.isArray(dailyJson) ? dailyJson : [];

  return { trades, positions, closePrices, dailyResults };
}

function extractM4Legs(source: any): any[] {
  if (Array.isArray(source?.m4)) {
    return source.m4 as any[];
  }
  if (Array.isArray(source?.all)) {
    return (source.all as any[]).filter((row) => row?.into === "M4");
  }
  if (Array.isArray(source)) {
    return (source as any[]).filter((row) => row?.into === "M4");
  }
  return [];
}

export const metadata: Metadata = {
  title: "M4 Breakdown Debug",
};

export default async function DebugM4Page({ searchParams }: PageProps) {
  const params =
    typeof (searchParams as any)?.then === "function"
      ? await (searchParams as Promise<SearchParams>)
      : (searchParams as SearchParams | undefined) ?? {};
  const rawSymbol = params.symbol?.trim() ?? "";
  const symbol = rawSymbol.toUpperCase();
  const dateParam = params.date?.trim() ?? "";
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const evalDate = datePattern.test(dateParam) ? dateParam : getLatestTradingDayStr();

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
  const breakdownSource = (result as any)?.aux?.breakdown;
  const allLegs = extractM4Legs(breakdownSource);
  const filteredLegs = symbol
    ? allLegs.filter((leg) => (leg?.symbol ?? "").toUpperCase() === symbol)
    : allLegs;

  const sumAll = round2(
    allLegs.reduce((acc, leg) => acc + Number(leg?.pnl_raw ?? leg?.pnl ?? 0), 0),
  );
  const sumFiltered = round2(
    filteredLegs.reduce((acc, leg) => acc + Number(leg?.pnl_raw ?? leg?.pnl ?? 0), 0),
  );
  const resultM4 = round2(Number((result as any)?.M4 ?? (result as any)?.M4?.total ?? 0));
  const diff = Math.abs(sumAll - resultM4);
  const withinTolerance = diff <= 0.01;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">M4 Breakdown 调试</h1>
      <div className="space-y-1 text-sm text-slate-600">
        <p>
          当前交易日：<span className="font-medium text-slate-900">{evalDate}</span>
        </p>
        <p>
          过滤标的：
          <span className="font-medium text-slate-900">
            {symbol ? symbol : "全部标的"}
          </span>
        </p>
        <p className="text-xs text-slate-500">
          可通过 ?symbol=TSLA 或 ?symbol=TSLA&amp;date=2024-01-02 调整筛选范围。
        </p>
      </div>

      <div className="space-y-1">
        <div>
          result.M4：<b>{resultM4.toFixed(2)}</b>
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
            {filteredLegs.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-center" colSpan={8}>
                  未找到满足条件的 M4 腿。
                </td>
              </tr>
            ) : (
              filteredLegs.map((leg, idx) => {
                const key = leg?.fillId ?? `${leg?.symbol ?? ""}-${idx}`;
                return (
                  <tr key={key ?? idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="border px-2 py-1">{leg?.symbol ?? "—"}</td>
                    <td className="border px-2 py-1">{leg?.fillId ?? "—"}</td>
                    <td className="border px-2 py-1">{leg?.time ?? "—"}</td>
                    <td className="border px-2 py-1">{leg?.action ?? "—"}</td>
                    <td className="border px-2 py-1 text-right">
                      {Number.isFinite(Number(leg?.qty)) ? Number(leg?.qty).toFixed(0) : "—"}
                    </td>
                    <td className="border px-2 py-1">{leg?.lotDateStr ?? "—"}</td>
                    <td className="border px-2 py-1">{String(leg?.from ?? "")}</td>
                    <td className="border px-2 py-1 text-right">
                      {Number(leg?.pnl_raw ?? leg?.pnl ?? 0).toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
