
"use client";

import { useEffect, useState, useMemo } from "react";
import { importData, findTrades } from "@/lib/services/dataService";
import type { Trade, Position } from "@/lib/services/dataService";
import { computeFifo } from "@/lib/fifo";
import { DashboardMetrics } from "@/modules/DashboardMetrics";
import { PositionsTable } from "@/modules/PositionsTable";
import { TradesTable } from "@/modules/TradesTable";
import { SymbolTags } from "@/modules/SymbolTags";
import AddTradeModal from "@/components/AddTradeModal";
import Link from "next/link";
import { fetchRealtimePrice } from "@/lib/services/priceService";

/**
 * 把 FIFO 计算出的 Position[] 补上最新价格
 */
async function attachRealtimePrices(raw: Position[]): Promise<Position[]> {
  return Promise.all(
    raw.map(async (p) => {
      try {
        const price = await fetchRealtimePrice(p.symbol);
        const ok = price !== null && price > 0;
        return { ...p, last: ok ? price : 0, priceOk: ok } as Position;
      } catch (e) {
        console.warn(`[Dashboard] fetchRealtimePrice failed for ${p.symbol}`, e);
        return { ...p, last: 0, priceOk: false } as Position;
      }
    })
  );
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        // 1. 导入初始示例数据（仅首次进入时）
        const response = await fetch("/trades.json");
        if (!response.ok) throw new Error("Failed to fetch trades.json");
        const rawData = await response.json();
        await importData(rawData);

        // 2. 从 IndexedDB 读取全部 trades 并 enrich
        const dbTrades = await findTrades();
        const enriched = computeFifo(dbTrades);

        // 3. 取每个 symbol 的最新头寸
        const latest: Record<string, typeof enriched[number]> = {};
        for (const t of enriched) latest[t.symbol] = t;
        const rawPos: Position[] = Object.values(latest)
          .filter((t) => t.quantityAfter !== 0)
          .map((t) => ({
            symbol: t.symbol,
            qty: t.quantityAfter,
            avgPrice: t.averageCost,
            last: 0,
            priceOk: true,
          }));

        // 4. 补全实时价格
        const posWithPrice = await attachRealtimePrices(rawPos);

        setTrades(dbTrades);
        setPositions(posWithPrice);
      } catch (e):
        console.error(e);
        setError(e instanceof Error ? e.message : "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const enrichedTrades = useMemo(() => (trades.length ? computeFifo(trades) : []), [trades]);
  const symbolsInPositions = useMemo(() => positions.map((p) => p.symbol), [positions]);

  async function reloadData() {
    try {
      const dbTrades = await findTrades();
      const enriched = computeFifo(dbTrades);
      const latest: Record<string, typeof enriched[number]> = {};
      for (const t of enriched) latest[t.symbol] = t;
      const rawPos: Position[] = Object.values(latest)
        .filter((t) => t.quantityAfter !== 0)
        .map((t) => ({
          symbol: t.symbol,
          qty: t.quantityAfter,
          avgPrice: t.averageCost,
          last: 0,
          priceOk: true,
        }));
      const posWithPrice = await attachRealtimePrices(rawPos);

      setTrades(dbTrades);
      setPositions(posWithPrice);
    } catch (e) {
      console.error(e);
    }
  }

  if (isLoading) return <div className="text-center p-10">Loading Dashboard...</div>;
  if (error) return <div className="text-center p-10 text-destructive">Error: {error}</div>;

  return (
    <div>
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      <h3 className="section-title" id="positions-title">
        目前持仓 <Link href="/analysis" className="details">交易分析</Link>
      </h3>
      <PositionsTable positions={positions} trades={enrichedTrades} />

      <h3 className="section-title">
        个股情况 <Link href="/" className="details" style={{ visibility: "hidden" }}>详情</Link>
      </h3>
      <SymbolTags symbols={symbolsInPositions} />

      <h3 className="section-title">
        交易记录 <Link href="/trades" className="details">查看全部</Link>
      </h3>
      <TradesTable trades={enrichedTrades} />

      <button id="fab" onClick={() => setShowModal(true)}>+</button>
      {showModal && <AddTradeModal onClose={() => setShowModal(false)} onAdded={reloadData} />}
    </div>
  );
}
