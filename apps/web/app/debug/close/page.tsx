"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildOfficialCloseMaps,
  type OfficialCloseDetailMap,
  type OfficialCloseEntry,
  type OfficialCloseLayer,
} from "@/app/lib/prices/buildOfficialCloseMaps";
import {
  readClosePricesVersion,
  readClosePricesVersionMeta,
} from "@/app/lib/prices/closePricesVersion";
import {
  getLastPackagedSyncStats,
  type SyncPackagedClosesStats,
} from "@/app/lib/prices/syncPackagedClosesToIdb";
import { isOfficialCloseSource } from "@/app/lib/services/dataService";
import {
  explainBatch,
  afterImportMaintenance,
  explainMissingClose,
  type CloseExplain,
} from "@/app/lib/diagnostics/explainMissingClose";
import { isOfficialCloseFixEnabled } from "@/app/lib/prices/officialCloseFacade";

const DEF_SYMBOLS =
  "AMD,BA,DIS,GOOGL,NVDL,PYPL,TSDD,UAL,AMZN,APP,INTC,SCHW,COST";
const DEF_DATES = "2025-09-19,2025-10-03,2025-10-06";

interface CloseDebugStats {
  version: string | null;
  updatedAt: number | null;
  reason: string;
  overlayCount: number;
  fallbackCount: number;
  seedStats: SyncPackagedClosesStats;
  advanced?: {
    packagedCount: number;
    idbCount: number;
    layerCounts: Record<OfficialCloseLayer, number>;
    sourceBreakdown: Array<{ source: string; count: number; official: boolean }>;
  };
}

function countEntries(map: Record<string, Record<string, number>>): number {
  return Object.values(map).reduce(
    (sum, byDate) => sum + Object.keys(byDate).length,
    0,
  );
}

function summarizeOfficialDetail(detail: OfficialCloseDetailMap) {
  const layerCounts: Record<OfficialCloseLayer, number> = {
    overlay: 0,
    packaged: 0,
    idb: 0,
  };
  const sourceCounts = new Map<string, number>();
  for (const byDate of Object.values(detail)) {
    for (const entry of Object.values(byDate) as OfficialCloseEntry[]) {
      layerCounts[entry.fromLayer] += 1;
      const key = entry.source || "unknown";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }
  }
  const sourceBreakdown = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({
      source,
      count,
      official: isOfficialCloseSource(source),
    }))
    .sort((a, b) => b.count - a.count);
  return { layerCounts, sourceBreakdown };
}

function formatReason(reason: string): string {
  switch (reason) {
    case "fetch":
      return "抓取文件";
    case "import":
      return "本地导入";
    case "writeback":
      return "远端写回";
    default:
      return reason || "未知";
  }
}

export default function ClosePriceDebugger() {
  const searchParams = useSearchParams();
  const queryEval = (searchParams.get("eval") ?? "").trim();
  const queryPrev = (searchParams.get("prev") ?? "").trim();
  const initialDates = useMemo(() => {
    const parts = [queryEval, queryPrev].filter(Boolean);
    if (!parts.length) return DEF_DATES;
    return Array.from(new Set(parts)).join(",");
  }, [queryEval, queryPrev]);

  const [symbols, setSymbols] = useState(DEF_SYMBOLS);
  const [dates, setDates] = useState(initialDates);
  const [rows, setRows] = useState<CloseExplain[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<CloseDebugStats | null>(null);
  const hasAutoRun = useRef(false);

  const grouped = useMemo(() => explainMissingClose(rows), [rows]);
  const eMinusOneSummary = useMemo(
    () => grouped.map((item) => `${item.day}：${item.symbols.join("、")}`).join("；"),
    [grouped],
  );

  const refreshStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { maps, debug } = await buildOfficialCloseMaps();
      const overlayCount = countEntries(maps.overlay);
      const fallbackCount = countEntries(maps.fallback);
      const version = readClosePricesVersion();
      const meta = readClosePricesVersionMeta();
      const seedStats = getLastPackagedSyncStats();
      const advancedEnabled = isOfficialCloseFixEnabled() && Boolean(debug);
      const advanced = advancedEnabled && debug
        ? (() => {
            const { layerCounts, sourceBreakdown } = summarizeOfficialDetail(debug.detail);
            return {
              packagedCount: countEntries(debug.packaged),
              idbCount: countEntries(debug.idb),
              layerCounts,
              sourceBreakdown,
            };
          })()
        : undefined;
      setStats({
        version: version ?? null,
        updatedAt: meta?.updatedAt ?? null,
        reason: meta?.reason ?? "unknown",
        overlayCount,
        fallbackCount,
        seedStats,
        advanced,
      });
    } catch (error) {
      console.error('[debug/close] refreshStats failed', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const runWith = useCallback(
    async (symbolInput: string, dateInput: string) => {
      setLoading(true);
      try {
        await afterImportMaintenance();
        const ss = symbolInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const ds = dateInput
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
        const result = await explainBatch(ss, ds);
        setRows(result);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onRun = useCallback(() => {
    void runWith(symbols, dates);
  }, [runWith, symbols, dates]);

  useEffect(() => {
    if (hasAutoRun.current) return;
    if (!queryEval) return;
    hasAutoRun.current = true;
    void runWith(DEF_SYMBOLS, initialDates);
  }, [initialDates, queryEval, runWith]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">诊断：导入后仍提示缺价（逐步原因）</h1>
        <button
          className="px-3 py-1 border rounded"
          onClick={() => void refreshStats()}
          disabled={statsLoading}
        >
          {statsLoading ? "刷新中..." : "刷新概览"}
        </button>
      </div>
      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border rounded p-4 space-y-2">
            <h2 className="font-semibold">版本信息</h2>
            <p>当前版本：{stats.version ?? "(未知)"}</p>
            <p>
              最后刷新：
              {stats.updatedAt
                ? new Date(stats.updatedAt).toLocaleString()
                : "未知"}
            </p>
            <p>触发来源：{formatReason(stats.reason)}</p>
            <p>
              播种跳过：{stats.seedStats.skipped.total}
              （高优先 {stats.seedStats.skipped.higherPriority}、同值
              {stats.seedStats.skipped.same}） / {stats.seedStats.total}，
              写入：{stats.seedStats.inserted}
            </p>
            <p>fallback map 条目：{stats.fallbackCount}</p>
            <p>overlay map 条目：{stats.overlayCount}</p>
          </div>
          {stats.advanced && (
            <div className="border rounded p-4 space-y-2">
              <h2 className="font-semibold text-emerald-700">实验特性已启用</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>overlay 层条目：{stats.advanced.layerCounts.overlay}</li>
                <li>packaged 层条目：{stats.advanced.layerCounts.packaged}</li>
                <li>idb 层条目：{stats.advanced.layerCounts.idb}</li>
                <li>packaged map 覆盖：{stats.advanced.packagedCount}</li>
                <li>idb map 覆盖：{stats.advanced.idbCount}</li>
              </ul>
            </div>
          )}
          {stats.advanced && (
            <div className="border rounded p-4 md:col-span-2">
              <h2 className="font-semibold">来源分布</h2>
              <table className="mt-2 w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 border text-left">source</th>
                    <th className="p-2 border text-right">entries</th>
                    <th className="p-2 border text-left">官方来源?</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.advanced.sourceBreakdown.length === 0 ? (
                    <tr>
                      <td className="p-3 text-center text-gray-500" colSpan={3}>
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    stats.advanced.sourceBreakdown.map((item) => (
                      <tr key={item.source}>
                        <td className="p-2 border font-mono">{item.source}</td>
                        <td className="p-2 border text-right">{item.count}</td>
                        <td className="p-2 border">
                          {item.official ? "官方" : "非官方"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-4 md:flex-row">
        <input
          className="flex-1 border p-2 rounded"
          value={symbols}
          onChange={(e) => setSymbols(e.target.value)}
          placeholder="输入代码，逗号分隔"
        />
        <input
          className="flex-1 border p-2 rounded"
          value={dates}
          onChange={(e) => setDates(e.target.value)}
          placeholder="输入日期，逗号分隔"
        />
        <button
          className="px-4 py-2 border rounded"
          onClick={onRun}
          disabled={loading}
        >
          {loading ? "扫描中..." : "开始扫描"}
        </button>
      </div>
      <table className="w-full text-sm border">
        {eMinusOneSummary && (
          <caption className="caption-top text-left text-amber-700 font-medium">
            上一纽约交易日(E-1) 需补录：{eMinusOneSummary}
          </caption>
        )}
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 border">symbol</th>
            <th className="p-2 border">date</th>
            <th className="p-2 border">tradingDay</th>
            <th className="p-2 border">needOfficial</th>
            <th className="p-2 border">verdict</th>
            <th className="p-2 border">layers</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="p-6 text-center text-gray-500" colSpan={6}>
                点击“开始扫描”
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={`${r.symbol}-${r.date}-${i}`}
                className={r.verdict === "OK" ? "" : "bg-amber-50"}
              >
                <td className="p-2 border font-mono">{r.symbol}</td>
                <td className="p-2 border font-mono">{r.date}</td>
                <td className="p-2 border">{String(r.tradingDay)}</td>
                <td className="p-2 border">{String(r.needOfficial)}</td>
                <td className="p-2 border font-bold">{r.verdict}</td>
                <td className="p-2 border">
                  <ul className="list-disc pl-5 space-y-1">
                    {r.layers.map((layer, idx) => (
                      <li key={idx}>
                        <b>{layer.step}</b>: {layer.ok ? "OK" : "FAIL"}
                        {layer.detail ? ` — ${layer.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
