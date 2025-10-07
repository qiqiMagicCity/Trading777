"use client";

import React, { useEffect, useMemo, useState } from "react";

type Leg = {
  fillId: string;
  time: string;
  action: string;
  qty: number;
  lotDateStr: string;
  from: string;
  pnl_raw: number;
};

type ApiOk = {
  ok: true;
  symbol: string;
  data: {
    M4: number;
    sumRaw?: number;
    legs: Leg[];
  };
};

type ApiError = { ok: false; error: string };

type ApiResponse = ApiOk | ApiError;

type FetchState = {
  loading: boolean;
  response: ApiResponse | null;
};

const initialState: FetchState = { loading: false, response: null };

export default function DebugM4Page() {
  const [symbol, setSymbol] = useState<string>("");
  const [{ loading, response }, setState] = useState<FetchState>(initialState);

  const legs = useMemo(() => {
    if (!response || !response.ok) return [] as Leg[];
    return response.data.legs;
  }, [response]);

  const sumRaw = useMemo(() => {
    if (!response || !response.ok) return 0;
    if (typeof response.data.sumRaw === "number") {
      return response.data.sumRaw;
    }
    return legs.reduce((acc, leg) => acc + Number(leg.pnl_raw || 0), 0);
  }, [legs, response]);

  const query = async (nextSymbol: string) => {
    const trimmed = nextSymbol.trim().toUpperCase();
    if (!trimmed) {
      setState({ loading: false, response: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/debug/m4?symbol=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      });
      const body = (await res.json()) as ApiResponse;
      setState({ loading: false, response: body });
    } catch (error) {
      setState({
        loading: false,
        response: { ok: false, error: error instanceof Error ? error.message : String(error) },
      });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSymbol = (params.get("symbol") ?? "").toUpperCase();
    if (initialSymbol) {
      setSymbol(initialSymbol);
      void query(initialSymbol);
    }
  }, []);

  const renderTable = () => {
    if (!response) {
      return <div className="text-gray-500">输入标的并点击“查询”。</div>;
    }
    if (!response.ok) {
      return <div className="text-red-600">查询失败：{response.error}</div>;
    }

    return (
      <>
        <div>
          result.M4: <b>{response.data.M4.toFixed(2)}</b>
        </div>
        <div>
          sum(pnl_raw of legs): <b>{sumRaw.toFixed(2)}</b>
        </div>
        <div className="text-sm opacity-70">
          应满足：sum(pnl_raw)≈result.M4（误差 ≤ $0.01）且所有腿 <code>{"from==='history'"}</code>
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
            {legs.map((leg) => (
              <tr key={leg.fillId}>
                <td className="border px-2 py-1">{leg.fillId}</td>
                <td className="border px-2 py-1">{leg.time}</td>
                <td className="border px-2 py-1">{leg.action}</td>
                <td className="border px-2 py-1">{leg.qty}</td>
                <td className="border px-2 py-1">{leg.lotDateStr}</td>
                <td className="border px-2 py-1">{leg.from}</td>
                <td className="border px-2 py-1">{Number(leg.pnl_raw || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">M4 Breakdown Debug</h1>
      <div className="flex gap-2">
        <input
          className="border px-2 py-1 rounded"
          placeholder="输入标的，如 AAPL"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
        />
        <button className="border px-3 py-1 rounded" onClick={() => void query(symbol)} disabled={loading}>
          {loading ? "加载中..." : "查询"}
        </button>
      </div>
      {renderTable()}
    </div>
  );
}
