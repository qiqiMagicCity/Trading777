'use client';

import { useEffect, useState, useMemo } from 'react';
import { importData, findTrades, clearAllData, loadDailyResults } from '@/lib/services/dataService';
import { loadJson } from '@/app/lib/dataSource';
import type { Trade, Position } from '@/lib/services/dataService';
import type { EnrichedTrade } from '@/lib/fifo';
import { buildEnrichedTrades, replayPortfolio } from '@/app/lib/tradeReplay';
import { DashboardMetrics } from '@/modules/DashboardMetrics';
import { PositionsTable } from '@/modules/PositionsTable';
import { TradesTable } from '@/modules/TradesTable';
import { SymbolTags } from '@/modules/SymbolTags';
import AddTradeModal from '@/components/AddTradeModal';
import Link from 'next/link';
import { calcMetrics, normalizeMetrics } from '@/app/lib/metrics';
import { useStore } from '@/lib/store';
import { fetchRealtimeQuote, fetchDailyClose } from '@/lib/services/priceService';
import { getLatestTradingDayStr } from '@/lib/timezone';

const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;

async function computeDataHash(data: unknown): Promise<string> {
  const json = JSON.stringify(data);
  try {
    if (typeof crypto?.subtle !== 'undefined') {
      const buffer = new TextEncoder().encode(json);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* ignore */
  }
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const chr = json.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString();
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [enrichedTrades, setEnrichedTrades] = useState<EnrichedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        const tradesFile = await loadJson('trades');
        const initPositionsFile = await loadJson('initial_positions');
        const rawData = { trades: tradesFile, positions: initPositionsFile };

        const newHash = await computeDataHash(rawData);

        let storedHash: string | null = null;
        try {
          storedHash = localStorage.getItem('dataset-hash');
        } catch {
          /* ignore */
        }

        if (newHash !== storedHash) {
          await clearAllData();
          await importData(rawData);
          try {
            localStorage.setItem('dataset-hash', newHash);
          } catch {
            /* ignore */
          }
        }

        const dbTrades = await findTrades();
        const replay = replayPortfolio(dbTrades);
        const enriched = buildEnrichedTrades(replay.baseline);
        const posList: Position[] = replay.positions.map(pos => ({ ...pos }));

        // 为每个持仓获取最新价格
        for (const pos of posList) {
          try {
            let result = await fetchRealtimeQuote(pos.symbol);
            if (!result || result.price === 1) {
              const today = getLatestTradingDayStr();
              result = await fetchDailyClose(pos.symbol, today);
            }

            if (result && result.price && result.price !== 1) {
              pos.last = result.price;
              pos.priceOk = !result.stale;
            } else {
              pos.last = NaN;
              pos.priceOk = false;
            }
          } catch (e) {
            pos.last = NaN;
            pos.priceOk = false;
          }
        }

        if (posList.some(p => !p.priceOk)) {
          if (freezeDate) {
            setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
          } else {
            setError('无法获取实时价格，指标计算失败');
          }
          setIsLoading(false);
          return;
        }

        // 获取每日结果数据用于计算周期性指标
        const dailyResults = await loadDailyResults();

        // 计算指标并存入全局状态
        const rawMetrics = calcMetrics(enriched, posList, dailyResults);
        const metrics = normalizeMetrics(rawMetrics);
        useStore.getState().setMetrics(metrics as any);

        setTrades(dbTrades);
        setPositions(posList);
        setEnrichedTrades(enriched);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Unique set of all traded symbols
  const symbolsInTrades = useMemo(() => {
    const set = new Set(trades.map(t => t.symbol));
    return Array.from(set);
  }, [trades]);

  async function reloadData() {
    try {
      const dbTrades = await findTrades();
      const replay = replayPortfolio(dbTrades);
      const enriched = buildEnrichedTrades(replay.baseline);
      const posList: Position[] = replay.positions.map(pos => ({ ...pos }));

      for (const pos of posList) {
        try {
          let result = await fetchRealtimeQuote(pos.symbol);
          if (!result || result.price === 1) {
            const today = getLatestTradingDayStr();
            result = await fetchDailyClose(pos.symbol, today);
          }
          if (result && result.price && result.price !== 1) {
            pos.last = result.price;
            pos.priceOk = !result.stale;
          } else {
            pos.last = NaN;
            pos.priceOk = false;
          }
        } catch (e) {
          pos.last = NaN;
          pos.priceOk = false;
        }
      }

      if (posList.some(p => !p.priceOk)) {
        if (freezeDate) {
          setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
        } else {
          setError('无法获取实时价格，指标计算失败');
        }
        return;
      }

      // 获取每日结果数据用于计算周期性指标
      const dailyResults = await loadDailyResults();

      // 计算指标并更新全局状态
      const rawMetrics = calcMetrics(enriched, posList, dailyResults);
      const metrics = normalizeMetrics(rawMetrics);
      useStore.getState().setMetrics(metrics as any);

      setTrades(dbTrades);
      setPositions(posList);
      setEnrichedTrades(enriched);
    } catch (e) { console.error(e); }
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading Dashboard...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-destructive">Error: {error}</div>;
  }

  return (
    <div>
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      <h3 className="section-title" id="positions-title">目前持仓 <Link href="/analysis" className="details">交易分析</Link></h3>
      <PositionsTable positions={positions} trades={enrichedTrades} />

      <h3 className="section-title">个股情况 <Link href="/" className="details" style={{ visibility: 'hidden' }}>详情</Link></h3>
      <SymbolTags symbols={symbolsInTrades} />

      <h3 className="section-title">交易记录 <Link href="/trades" className="details">查看全部</Link></h3>
      <TradesTable trades={enrichedTrades} />

      <button
        id="fab"
        onClick={() => setShowModal(true)}
      >
        +
      </button>
      {showModal && <AddTradeModal onClose={() => setShowModal(false)} onAdded={reloadData} />}
    </div>
  );
}
