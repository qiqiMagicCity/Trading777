'use client';

import { useEffect, useState, useMemo } from 'react';
import { importData, findTrades } from '@/lib/services/dataService';
import type { Trade, Position } from '@/lib/services/dataService';
import { computeFifo } from '@/lib/fifo';
import { DashboardMetrics } from '@/modules/DashboardMetrics';
import { PositionsTable } from '@/modules/PositionsTable';
import { TradesTable } from '@/modules/TradesTable';
import { SymbolTags } from '@/modules/SymbolTags';
import AddTradeModal from '@/components/AddTradeModal';
import Link from 'next/link';
import { calcMetrics } from '@/lib/metrics';
import { fetchRealtimeQuote } from '@/lib/services/priceService';   // ⬅️ 新增导入
import { useStore } from '@/lib/store';

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
        const response = await fetch('/trades.json');
        if (!response.ok) {
          throw new Error('Failed to fetch trades.json');
        }
        const rawData = await response.json();
        await importData(rawData);

        const dbTrades = await findTrades();
        const enriched = computeFifo(dbTrades);

        // 根据 enriched 计算最新持仓
        const lastMap: Record<string, any> = {};
        for (const t of enriched) {
          lastMap[t.symbol] = t; // 由于 computeFifo 已排好序，最后一条为最新状态
        }

        const posList: Position[] = Object.values(lastMap)
          .filter(t => t.quantityAfter !== 0)
          .map(t => ({
            symbol: t.symbol,
            qty: t.quantityAfter,
            avgPrice: t.averageCost,
            last: t.averageCost,   // 先用均价占位
            priceOk: true,
          }));

        /* === 新增：拉取实时价格并更新 last 字段 === */
        for (const p of posList) {
          try {
            const rt = await fetchRealtimeQuote(p.symbol);
            if (!isNaN(rt) && rt > 0) {
              p.last = rt;
              p.priceOk = true;
            }
          } catch (e) {
            console.warn(`获取 ${p.symbol} 实时价格失败`, e);
          }
        }
        /* === 实时价格更新完毕 === */

        // 获取每日结果数据用于计算周期性指标
        const dailyResultsResponse = await fetch('/dailyResult.json');
        const dailyResults = dailyResultsResponse.ok ? await dailyResultsResponse.json() : [];

        // 计算指标并存入全局状态
        const metrics = calcMetrics(enriched, posList, dailyResults);
        useStore.getState().setMetrics(metrics);

        setTrades(dbTrades);
        setPositions(posList);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const enrichedTrades = useMemo(() => {
    if (!trades.length) return [];
    return computeFifo(trades);
  }, [trades]);

  /** 处理“添加交易”后刷新仪表盘 */
  async function handleTradesChange() {
    try {
      const dbTrades = await findTrades();
      const enriched = computeFifo(dbTrades);

      const lastMap: Record<string, any> = {};
      for (const t of enriched) {
        lastMap[t.symbol] = t;
      }

      const posList: Position[] = Object.values(lastMap)
        .filter(t => t.quantityAfter !== 0)
        .map(t => ({
          symbol: t.symbol,
          qty: t.quantityAfter,
          avgPrice: t.averageCost,
          last: t.averageCost,
          priceOk: true,
        }));

      /* === 新增：拉取实时价格并更新 last 字段 === */
      for (const p of posList) {
        try {
          const rt = await fetchRealtimeQuote(p.symbol);
          if (!isNaN(rt) && rt > 0) {
            p.last = rt;
            p.priceOk = true;
          }
        } catch (e) {
          console.warn(`获取 ${p.symbol} 实时价格失败`, e);
        }
      }
      /* === 实时价格更新完毕 === */

      // 获取每日结果数据用于计算周期性指标
      const dailyResultsResponse = await fetch('/dailyResult.json');
      const dailyResults = dailyResultsResponse.ok ? await dailyResultsResponse.json() : [];

      // 计算指标并更新全局状态
      const metrics = calcMetrics(enriched, posList, dailyResults);
      useStore.getState().setMetrics(metrics);

      setTrades(dbTrades);
      setPositions(posList);
    } catch (e) { console.error(e); }
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading Dashboard...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-destructive">Error: {error}</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <section className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">交易仪表盘</h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary"
        >
          + 添加交易
        </button>
      </section>

      {/* Top-level metrics (M1-M13) */}
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      {/* Positions */}
      <PositionsTable positions={positions} trades={enrichedTrades} />

      {/* Trades */}
      <TradesTable trades={trades} onChange={handleTradesChange} />

      {/* 股票标签 */}
      <SymbolTags trades={trades} />

      {/* 弹窗：新增交易 */}
      {showModal && <AddTradeModal onClose={() => setShowModal(false)} onSuccess={handleTradesChange} />}

      {/* 底部链接 */}
      <footer className="text-center mt-10 text-sm text-muted-foreground">
        <Link href="https://github.com/your-repo" target="_blank">项目仓库</Link>
      </footer>
    </div>
  );
}
