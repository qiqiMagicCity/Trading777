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
import { fetchRealtimeQuote } from '@/lib/services/priceService';
import { useStore } from '@/lib/store';

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  /* ---------- 首次加载 ---------- */
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        /* 1. 读取交易数据 */
        const res = await fetch('/trades.json');
        if (!res.ok) throw new Error('Failed to fetch trades.json');
        const raw = await res.json();
        await importData(raw);

        /* 2. enrichedTrades */
        const dbTrades = await findTrades();
        const enriched = computeFifo(dbTrades);

        /* 3. 生成当前持仓 */
        const lastMap: Record<string, any> = {};
        for (const t of enriched) lastMap[t.symbol] = t;
        const posList: Position[] = Object.values(lastMap)
          .filter(t => t.quantityAfter !== 0)
          .map(t => ({
            symbol: t.symbol,
            qty: t.quantityAfter,
            avgPrice: t.averageCost,
            last: t.averageCost,
            priceOk: true,
          }));

        /* 4. 实时价格填充 */
        for (const p of posList) {
          try {
            const rt = await fetchRealtimeQuote(p.symbol);
            if (!isNaN(rt) && rt > 0) p.last = rt;
          } catch (e) {
            console.warn(`实时价格 ${p.symbol} 获取失败`, e);
          }
        }

        /* 5. 指标写入全局 */
        const dailyRes = await fetch('/dailyResult.json');
        const daily = dailyRes.ok ? await dailyRes.json() : [];
        const metrics = calcMetrics(enriched, posList, daily);
        useStore.getState().setMetrics(metrics);

        /* 6. 写入本地状态 */
        setTrades(dbTrades);
        setPositions(posList);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  /* ---------- memo 化的 enrichedTrades ---------- */
  const enrichedTrades = useMemo(() => {
    if (!trades.length) return [];
    return computeFifo(trades);
  }, [trades]);

  /* ---------- 添加 / 修改交易后刷新 ---------- */
  async function handleTradesChange() {
    try {
      const dbTrades = await findTrades();
      const enriched = computeFifo(dbTrades);

      const lastMap: Record<string, any> = {};
      for (const t of enriched) lastMap[t.symbol] = t;

      const posList: Position[] = Object.values(lastMap)
        .filter(t => t.quantityAfter !== 0)
        .map(t => ({
          symbol: t.symbol,
          qty: t.quantityAfter,
          avgPrice: t.averageCost,
          last: t.averageCost,
          priceOk: true,
        }));

      for (const p of posList) {
        try {
          const rt = await fetchRealtimeQuote(p.symbol);
          if (!isNaN(rt) && rt > 0) p.last = rt;
        } catch (e) {
          console.warn(`实时价格 ${p.symbol} 获取失败`, e);
        }
      }

      const dailyRes = await fetch('/dailyResult.json');
      const daily = dailyRes.ok ? await dailyRes.json() : [];
      const metrics = calcMetrics(enriched, posList, daily);
      useStore.getState().setMetrics(metrics);

      setTrades(dbTrades);
      setPositions(posList);
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------- 渲染 ---------- */
  if (isLoading)
    return <div className="text-center p-10">Loading Dashboard...</div>;

  if (error)
    return <div className="text-center p-10 text-destructive">Error: {error}</div>;

  return (
    <div className="p-4 space-y-6">
      {/* 顶部工具栏 */}
      <section className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">交易仪表盘</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          + 添加交易
        </button>
      </section>

      {/* M1-M13 指标 */}
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      {/* 当前持仓 */}
      <PositionsTable positions={positions} trades={enrichedTrades} />

      {/* 全部交易（仅传 trades，已移除 onChange） */}
      <TradesTable trades={enrichedTrades} />

      {/* 股票标签 */}
      <SymbolTags trades={trades} />

      {/* 新增交易弹窗 */}
      {showModal && (
        <AddTradeModal
          onClose={() => setShowModal(false)}
          onSuccess={handleTradesChange}
        />
      )}

      {/* 底部链接 */}
      <footer className="text-center mt-10 text-sm text-muted-foreground">
        <Link href="https://github.com/your-repo" target="_blank">
          项目仓库
        </Link>
      </footer>
    </div>
  );
}
