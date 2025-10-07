"use client";

// 客户端页面：直接用 runAll({ ioProvider: apiIoProvider }) 计算
import React, { useEffect, useMemo, useState } from "react";
import { runAll } from "@/app/lib/runAll";
import { apiIoProvider } from "@/app/lib/io/providers";
import { round2 } from "@/app/lib/money";

type Leg = {
  fillId: string;
  time: string;
  action: string;
  qty: number;
  lotDateStr: string;
  from: string;
  pnl_raw: number;
  symbol?: string;
};

export default function DebugM4Page() {
  const [symbol, setSymbol] = useState("");
  const [m4, setM4] = useState<number | null>(null);
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sum = useMemo(() => legs.reduce((a, l) => a + Number(l.pnl_raw || 0), 0), [legs]);

  const query = async (sym: string) => {
    const trimmed = sym.trim().toUpperCase();
    setSymbol(trimmed);
    if (!trimmed) {
      setError("请输入标的");
      setM4(null);
      setLegs([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const baseUrl = window.location.origin;
      const r: any = await runAll({ ioProvider: apiIoProvider, baseUrl });
      const resultsMap = (r as Record<string, any>)?.results;
      const breakdownSource = (r as any)?.aux?.breakdown;
      const breakdownAll: any[] = Array.isArray(breakdownSource?.m4)
        ? (breakdownSource.m4 as any[])
        : Array.isArray(breakdownSource)
        ? (breakdownSource as any[])
        : [];

      const normalizeLeg = (l: any): Leg => ({
        fillId: String(l.fillId ?? ""),
        time: String(l.time ?? ""),
        action: String(l.action ?? ""),
        qty: Number(l.qty ?? 0),
        lotDateStr: String(l.lotDateStr ?? ""),
        from: String(l.from ?? ""),
        pnl_raw: Number(l.pnl_raw ?? 0),
        symbol: typeof l.symbol === "string" ? l.symbol : undefined,
      });

      const availableFromMap =
        resultsMap && typeof resultsMap === "object"
          ? Object.keys(resultsMap as Record<string, unknown>)
          : [];
      const availableFromBreakdown = Array.from(
        new Set(
          breakdownAll
            .map((row: any) => (typeof row.symbol === "string" ? row.symbol.toUpperCase() : ""))
            .filter((sym: string) => sym.length > 0),
        ),
      );

      let resolvedLegs: Leg[] = [];
      let resolvedM4: number | null = null;

      if (
        resultsMap &&
        typeof resultsMap === "object" &&
        Object.prototype.hasOwnProperty.call(resultsMap, trimmed)
      ) {
        const res = (resultsMap as Record<string, any>)[trimmed];
        const rawLegs = Array.isArray(res?.aux?.breakdown?.m4)
          ? (res.aux.breakdown.m4 as any[])
          : [];
        resolvedLegs = rawLegs.map(normalizeLeg);
        resolvedM4 = Number(res?.M4 ?? 0);
      } else {
        const filtered = breakdownAll
          .filter((row: any) => String(row?.symbol ?? "").toUpperCase() === trimmed)
          .map(normalizeLeg);
        if (filtered.length > 0) {
          resolvedLegs = filtered;
          resolvedM4 = round2(
            filtered.reduce((acc, leg) => acc + Number(leg.pnl_raw ?? 0), 0),
          );
        }
      }

      if (resolvedM4 === null) {
        setM4(null);
        setLegs([]);
        const candidates = availableFromMap.length > 0 ? availableFromMap : availableFromBreakdown;
        const hint = candidates.length > 0 ? `（可用：${candidates.slice(0, 10).join(", ")}` : "";
        setError(`未找到标的：${trimmed}${hint}${hint ? "…" : ""}`);
        return;
      }

      setError(null);
      setM4(resolvedM4);
      setLegs(resolvedLegs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setM4(null);
      setLegs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("symbol") || "";
    if (s) {
      void query(s);
    }
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">M4 Breakdown Debug</h1>
      <div className="flex gap-2">
        <input
          className="border px-2 py-1 rounded"
          placeholder="输入标的，如 AAPL"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
        <button className="border px-3 py-1 rounded" onClick={() => void query(symbol)} disabled={loading}>
          {loading ? "加载中..." : "查询"}
        </button>
      </div>

      {error ? (
        <div className="text-red-600">{error}</div>
      ) : m4 !== null ? (
        <>
          <div>
            result.M4: <b>{m4.toFixed(2)}</b>
          </div>
          <div>
            sum(pnl_raw of legs): <b>{sum.toFixed(2)}</b>
          </div>
          <div className="text-sm opacity-70">
            应满足：sum(pnl_raw)≈result.M4（误差≤$0.01）且所有腿 from==='history'
          </div>
          <table className="min-w-full text-sm border">
            <thead>
              <tr>
                <th className="border px-2 py-1">fillId</th>
                <th className="border px-2 py-1">time</th>
                <th className="border px-2 py-1">action</th>
                <th className="border px-2 py-1">qty</th>
                <th className="border px-2 py-1">lotDateStr</th>
                <th className="border px-2 py-1">from</th>
                <th className="border px-2 py-1">pnl_raw</th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l) => (
                <tr key={l.fillId}>
                  <td className="border px-2 py-1">{l.fillId}</td>
                  <td className="border px-2 py-1">{l.time}</td>
                  <td className="border px-2 py-1">{l.action}</td>
                  <td className="border px-2 py-1">{l.qty}</td>
                  <td className="border px-2 py-1">{l.lotDateStr}</td>
                  <td className="border px-2 py-1">{l.from}</td>
                  <td className="border px-2 py-1">{Number(l.pnl_raw || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="text-gray-500">输入标的并点击“查询”。</div>
      )}
    </div>
  );
}
