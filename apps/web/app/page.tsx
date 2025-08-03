'use client';

import { useEffect, useState, useMemo } from 'react';
import { importData, findTrades, clearAllData, findPositions } from '@/lib/services/dataService';
import type { Trade, Position, StoredPosition } from '@/lib/services/dataService';
import { computeFifo, type EnrichedTrade } from '@/lib/fifo';
import { DashboardMetrics } from '@/modules/DashboardMetrics';
import { PositionsTable } from '@/modules/PositionsTable';
import { TradesTable } from '@/modules/TradesTable';
import { SymbolTags } from '@/modules/SymbolTags';
import AddTradeModal from '@/components/AddTradeModal';
import Link from 'next/link';
import { calcMetrics } from '@/lib/metrics';
import { useStore } from '@/lib/store';
import { fetchRealtimeQuote, fetchDailyClose } from '@/lib/services/priceService';

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

function mergePositions(base: StoredPosition[], trades: EnrichedTrade[]): Position[] {
  type Lot = { price: number; quantity: number };
  type State = { positionList: Lot[]; direction: 'NONE' | 'LONG' | 'SHORT' };
  const map: Record<string, State> = {};

  // Initialize from historical positions
  for (const p of base) {
    const direction: State['direction'] = p.qty >= 0 ? 'LONG' : 'SHORT';
    const positionList: Lot[] = Math.abs(p.qty) > 0
      ? [{ price: p.avgPrice, quantity: Math.abs(p.qty) }]
      : [];
    map[p.symbol] = { positionList, direction };
  }

  // Apply today's trades sequentially (FIFO)
  for (const t of trades) {
    const { symbol, action, price, quantity } = t;
    let state = map[symbol];
    if (!state) {
      state = { positionList: [], direction: 'NONE' };
      map[symbol] = state;
    }
    if (action === 'buy' || action === 'cover') {
      if (state.direction === 'NONE' || state.direction === 'LONG') {
        state.positionList.push({ price, quantity });
        state.direction = 'LONG';
      } else {
        let remaining = quantity;
        while (remaining > 0 && state.positionList.length > 0) {
          const lot = state.positionList[0]!;
          const matched = Math.min(remaining, lot.quantity);
          lot.quantity -= matched;
          remaining -= matched;
          if (lot.quantity === 0) state.positionList.shift();
        }
        if (remaining > 0) {
          state.positionList.push({ price, quantity: remaining });
          state.direction = 'LONG';
        } else if (state.positionList.length === 0) {
          state.direction = 'NONE';
        }
      }
    } else {
      if (state.direction === 'NONE' || state.direction === 'SHORT') {
        state.positionList.push({ price, quantity });
        state.direction = 'SHORT';
      } else {
        let remaining = quantity;
        while (remaining > 0 && state.positionList.length > 0) {
          const lot = state.positionList[0]!;
          const matched = Math.min(remaining, lot.quantity);
          lot.quantity -= matched;
          remaining -= matched;
          if (lot.quantity === 0) state.positionList.shift();
        }
        if (remaining > 0) {
          state.positionList.push({ price, quantity: remaining });
          state.direction = 'SHORT';
        } else if (state.positionList.length === 0) {
          state.direction = 'NONE';
        }
      }
    }
  }

  const result: Position[] = [];
  for (const [symbol, state] of Object.entries(map)) {
    const totalQty = state.positionList.reduce((s, p) => s + p.quantity, 0);
    if (totalQty === 0) continue;
    const cost = state.positionList.reduce((s, p) => s + p.price * p.quantity, 0);
    const avg = cost / totalQty;
    result.push({
      symbol,
      qty: state.direction === 'SHORT' ? -totalQty : totalQty,
      avgPrice: avg,
      last: avg,
      priceOk: true,
    });
  }
  return result;
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

        const response = await fetch('/trades.json');
        if (!response.ok) {
          throw new Error('Failed to fetch trades.json');
        }
        const rawData = await response.json();

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

        let dbTrades = await findTrades();
        const enriched = computeFifo(dbTrades);
        const basePositions = await findPositions();

        if (!basePositions || basePositions.length === 0) {
          setError('缺少历史仓位数据');
          setIsLoading(false);
          return;
        }

        const posList = mergePositions(basePositions, enriched);

        // 为每个持仓获取最新价格
        for (const pos of posList) {
          try {
            let result = await fetchRealtimeQuote(pos.symbol);
            if (!result || result.price === 1) {
              const today = new Date().toISOString().slice(0, 10);
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
          setError('无法获取实时价格，指标计算失败');
          setIsLoading(false);
          return;
        }

        console.log('加载的持仓数据:', posList);
        console.log('持仓数据中的qty类型:', posList.map(p => ({
          symbol: p.symbol,
          qty: p.qty,
          qtyType: typeof p.qty,
          isNumber: !isNaN(Number(p.qty))
        })));

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
    if (trades.length > 0) {
      return computeFifo(trades);
    }
    return [];
  }, [trades]);

  // Unique set of all traded symbols
  const symbolsInTrades = useMemo(() => {
    const set = new Set(trades.map(t => t.symbol));
    return Array.from(set);
  }, [trades]);

  async function reloadData() {
    try {
      const dbTrades = await findTrades();
      const enriched = computeFifo(dbTrades);
      const basePositions = await findPositions();
      if (!basePositions || basePositions.length === 0) {
        setError('缺少历史仓位数据');
        return;
      }
      const posList = mergePositions(basePositions, enriched);

      for (const pos of posList) {
        try {
          let result = await fetchRealtimeQuote(pos.symbol);
          if (!result || result.price === 1) {
            const today = new Date().toISOString().slice(0, 10);
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
        setError('无法获取实时价格，指标计算失败');
        return;
      }

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
