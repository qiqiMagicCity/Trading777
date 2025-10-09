"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  explainBatch,
  afterImportMaintenance,
  explainMissingClose,
} from "@/app/lib/diagnostics/explainMissingClose";

const DEF_SYMBOLS =
  "AMD,BA,DIS,GOOGL,NVDL,PYPL,TSDD,UAL,AMZN,APP,INTC,SCHW,COST";
const DEF_DATES = "2025-09-19,2025-10-03,2025-10-06";

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
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const hasAutoRun = useRef(false);

  const grouped = useMemo(() => explainMissingClose(rows), [rows]);
  const eMinusOneSummary = useMemo(
    () => grouped.map((item) => `${item.day}：${item.symbols.join("、")}`).join("；"),
    [grouped],
  );

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

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">诊断：导入后仍提示缺价（逐步原因）</h1>
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
                    {r.layers.map((l: any, idx: number) => (
                      <li key={idx}>
                        <b>{l.step}</b>: {l.ok ? "OK" : "FAIL"}
                        {l.detail ? ` — ${l.detail}` : ""}
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
