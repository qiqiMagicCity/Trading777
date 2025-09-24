'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  findTrades,
  getAllPrices,
  setDailyResultsCache,
} from '@/lib/services/dataService';
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
import { fetchRealtimeQuote, fetchDailyClose, getCachedRealtimeQuote } from '@/lib/services/priceService';
import { getLatestTradingDayStr } from '@/lib/timezone';
import { generateDailyResults, mergeClosePriceMaps, normalizeClosePriceMap, closePricesFromRows } from '@/lib/dailyResults';

function resolvePrevClose(
  symbol: string,
  evalDate: string,
  closePrices: Record<string, Record<string, number>>,
): number | undefined {
  const byDate = closePrices[symbol];
  if (!byDate) return undefined;
  let candidateDate: string | null = null;
  for (const [date, price] of Object.entries(byDate)) {
    if (!Number.isFinite(price)) continue;
    if (date >= evalDate) continue;
    if (!candidateDate || date > candidateDate) {
      candidateDate = date;
    }
  }
  if (!candidateDate) return undefined;
  const price = byDate[candidateDate];
  return Number.isFinite(price) ? price : undefined;
}

function attachPrevClose(
  positions: Position[],
  closePrices: Record<string, Record<string, number>>,
  evalDate: string,
) {
  for (const pos of positions) {
    const prevClose = resolvePrevClose(pos.symbol, evalDate, closePrices);
    if (prevClose !== undefined) {
      pos.prevClose = prevClose;
    } else {
      delete pos.prevClose;
    }
  }
}

const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;

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

        await import('@/app/lib/ensureBuiltInDatasetLoaded')
          .then(m => m.ensureBuiltInDatasetLoaded())
          .catch(err => {
            console.error('Dataset bootstrap failed:', err);
            // Do NOT clear DB on failure; UI may show a non-blocking warning instead.
          });

        const dbTrades = await findTrades();
        const replay = replayPortfolio(dbTrades);
        const enriched = buildEnrichedTrades(replay.baseline);
        const posList: Position[] = replay.positions.map(pos => ({ ...pos }));

        // 为每个持仓获取最新价格
        for (const pos of posList) {
          const cached = getCachedRealtimeQuote(pos.symbol);
          if (cached?.price !== undefined) {
            pos.last = cached.price;
            pos.priceOk = true;
            pos.stale = true;
            pos.lastUpdatedAt = cached.updatedAt;
          }

          try {
            let result = await fetchRealtimeQuote(pos.symbol);
            if ((!result || typeof result.price !== 'number' || result.price === 1) && !freezeDate) {
              const today = getLatestTradingDayStr();
              const dailyClose = await fetchDailyClose(pos.symbol, today);
              if (dailyClose) {
                result = { ...dailyClose, priceOk: dailyClose.priceOk ?? true };
              }
            }

            if (result && typeof result.price === 'number' && result.price !== 1) {
              pos.last = result.price;
              pos.priceOk = result.priceOk !== false;
              pos.stale = Boolean(result.stale);
              pos.lastUpdatedAt = result.updatedAt ?? Date.now();
            } else if (Number.isFinite(pos.last) && pos.lastUpdatedAt) {
              pos.priceOk = true;
              pos.stale = true;
            } else {
              pos.last = NaN;
              pos.priceOk = false;
              pos.stale = true;
            }
          } catch (e) {
            if (Number.isFinite(pos.last) && pos.lastUpdatedAt) {
              pos.priceOk = true;
              pos.stale = true;
            } else {
              pos.last = NaN;
              pos.priceOk = false;
              pos.stale = true;
            }
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

        const evalDateStr = freezeDate ? freezeDate.slice(0, 10) : getLatestTradingDayStr();

        const [fileClosePrices, cachedPrices] = await Promise.all([
          loadJson('close_prices') as Promise<Record<string, Record<string, number>>>,
          getAllPrices(),
        ]);
        const mergedClosePrices = mergeClosePriceMaps(
          normalizeClosePriceMap(fileClosePrices),
          closePricesFromRows(cachedPrices),
        );

        attachPrevClose(posList, mergedClosePrices, evalDateStr);

        const dailyResults = generateDailyResults({
          trades: enriched,
          positions: posList,
          closePrices: mergedClosePrices,
          evalDate: evalDateStr,
        });
        setDailyResultsCache(dailyResults);

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
        const cached = getCachedRealtimeQuote(pos.symbol);
        if (cached?.price !== undefined) {
          pos.last = cached.price;
          pos.priceOk = true;
          pos.stale = true;
          pos.lastUpdatedAt = cached.updatedAt;
        }

        try {
          let result = await fetchRealtimeQuote(pos.symbol);
          if ((!result || typeof result.price !== 'number' || result.price === 1) && !freezeDate) {
            const today = getLatestTradingDayStr();
            const dailyClose = await fetchDailyClose(pos.symbol, today);
            if (dailyClose) {
              result = { ...dailyClose, priceOk: dailyClose.priceOk ?? true };
            }
          }
          if (result && typeof result.price === 'number' && result.price !== 1) {
            pos.last = result.price;
            pos.priceOk = result.priceOk !== false;
            pos.stale = Boolean(result.stale);
            pos.lastUpdatedAt = result.updatedAt ?? Date.now();
          } else if (Number.isFinite(pos.last) && pos.lastUpdatedAt) {
            pos.priceOk = true;
            pos.stale = true;
          } else {
            pos.last = NaN;
            pos.priceOk = false;
            pos.stale = true;
          }
        } catch (e) {
          if (Number.isFinite(pos.last) && pos.lastUpdatedAt) {
            pos.priceOk = true;
            pos.stale = true;
          } else {
            pos.last = NaN;
            pos.priceOk = false;
            pos.stale = true;
          }
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

      const evalDateStr = freezeDate ? freezeDate.slice(0, 10) : getLatestTradingDayStr();

      const [fileClosePrices, cachedPrices] = await Promise.all([
        loadJson('close_prices') as Promise<Record<string, Record<string, number>>>,
        getAllPrices(),
      ]);
      const mergedClosePrices = mergeClosePriceMaps(
        normalizeClosePriceMap(fileClosePrices),
        closePricesFromRows(cachedPrices),
      );

      attachPrevClose(posList, mergedClosePrices, evalDateStr);

      const dailyResults = generateDailyResults({
        trades: enriched,
        positions: posList,
        closePrices: mergedClosePrices,
        evalDate: evalDateStr,
      });
      setDailyResultsCache(dailyResults);

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
