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
import { getLatestTradingDayStr, toNY } from '@/lib/timezone';
import { generateDailyResults, mergeClosePriceMaps, normalizeClosePriceMap, closePricesFromRows } from '@/lib/dailyResults';
import { logger } from '@/lib/logger';

function buildLastTradePriceTodayMap(
  trades: EnrichedTrade[],
  evalDate: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const trade of trades) {
    if (!trade?.symbol) continue;
    if (!trade.date) continue;
    const parsed = toNY(trade.date as string);
    if (Number.isNaN(parsed.getTime())) continue;
    const day = parsed.toISOString().slice(0, 10);
    if (day !== evalDate) continue;
    const price = Number(trade.price);
    if (Number.isFinite(price)) {
      map.set(trade.symbol, price);
    }
  }
  return map;
}

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
  const [markWarning, setMarkWarning] = useState<string | null>(null);

  async function computeDashboardData() {
    const dbTrades = await findTrades();
    const replay = replayPortfolio(dbTrades);
    const enriched = buildEnrichedTrades(replay.baseline);
    const posList: Position[] = replay.positions.map(pos => ({ ...pos }));
    const pendingFallback = new Set<string>();
    const fallbackSymbols = new Set<string>();

    const logWarn = (symbol: string, err: unknown) => {
      logger.warn('realtime price unavailable', { symbol, err });
    };

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
          pos.last = Number.isFinite(pos.last) ? pos.last : Number.NaN;
          pos.priceOk = false;
          pos.stale = true;
          pendingFallback.add(pos.symbol);
          logWarn(pos.symbol, { reason: 'empty_quote', result });
        }
      } catch (e) {
        logWarn(pos.symbol, e instanceof Error ? e : { reason: 'exception', error: e });
        if (Number.isFinite(pos.last) && pos.lastUpdatedAt) {
          pos.priceOk = true;
          pos.stale = true;
        } else {
          pos.last = Number.isFinite(pos.last) ? pos.last : Number.NaN;
          pos.priceOk = false;
          pos.stale = true;
          pendingFallback.add(pos.symbol);
        }
      }
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

    const lastTradePriceToday = buildLastTradePriceTodayMap(enriched, evalDateStr);

    for (const pos of posList) {
      const needsFallback =
        pendingFallback.has(pos.symbol) ||
        !Number.isFinite(pos.last) ||
        pos.priceOk === false;

      if (!needsFallback) continue;

      const prevClose = Number(pos.prevClose);
      const tradePrice = lastTradePriceToday.get(pos.symbol);
      let fallback: number | undefined;

      if (Number.isFinite(prevClose)) {
        fallback = Number(prevClose);
      } else if (Number.isFinite(tradePrice)) {
        fallback = Number(tradePrice);
      }

      if (fallback !== undefined) {
        if (!Number.isFinite(pos.last)) {
          pos.last = fallback;
        }
        pos.priceOk = false;
        pos.stale = true;
        pos.lastUpdatedAt = pos.lastUpdatedAt ?? Date.now();
        fallbackSymbols.add(pos.symbol);
        logWarn(pos.symbol, { reason: 'fallback_mark', fallback });
      } else {
        if (!Number.isFinite(pos.last)) {
          pos.last = Number.isFinite(pos.avgPrice) ? pos.avgPrice : 0;
        }
        pos.priceOk = false;
        pos.stale = true;
        pos.lastUpdatedAt = pos.lastUpdatedAt ?? Date.now();
        fallbackSymbols.add(pos.symbol);
        logWarn(pos.symbol, { reason: 'fallback_mark', fallback: null });
      }
    }

    const dailyResults = generateDailyResults({
      trades: enriched,
      positions: posList,
      closePrices: mergedClosePrices,
      evalDate: evalDateStr,
    });

    return {
      trades: dbTrades,
      positions: posList,
      enrichedTrades: enriched,
      dailyResults,
      markWarning: fallbackSymbols.size ? 'PRICE_FALLBACK' : null,
      markFallbackSymbols: Array.from(fallbackSymbols),
    };
  }

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setMarkWarning(null);

        await import('@/app/lib/ensureBuiltInDatasetLoaded')
          .then(m => m.ensureBuiltInDatasetLoaded())
          .catch(err => {
            console.error('Dataset bootstrap failed:', err);
            // Do NOT clear DB on failure; UI may show a non-blocking warning instead.
          });

        const data = await computeDashboardData();

        const rawMetrics = calcMetrics(data.enrichedTrades, data.positions, data.dailyResults);
        const markFallbackSymbols = new Set<string>(data.markFallbackSymbols);
        if (Array.isArray(rawMetrics.aux?.markFallbackSymbols)) {
          for (const symbol of rawMetrics.aux!.markFallbackSymbols!) {
            markFallbackSymbols.add(symbol);
          }
        }
        const markWarningLabel = data.markWarning ?? rawMetrics.aux?.markWarning ?? null;
        const metrics = normalizeMetrics({
          ...rawMetrics,
          aux: {
            ...rawMetrics.aux,
            markWarning: markWarningLabel ?? undefined,
            staleMarks: markWarningLabel ? true : rawMetrics.aux?.staleMarks,
            markFallbackSymbols: markFallbackSymbols.size
              ? Array.from(markFallbackSymbols)
              : rawMetrics.aux?.markFallbackSymbols,
          },
        });

        useStore.getState().setMetrics(metrics as any);
        setDailyResultsCache(data.dailyResults);

        setTrades(data.trades);
        setPositions(data.positions);
        setEnrichedTrades(data.enrichedTrades);

        if (freezeDate && data.markWarning) {
          setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
        } else {
          setError(null);
        }
        setMarkWarning(markWarningLabel);
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
      setMarkWarning(null);
      const data = await computeDashboardData();
      const rawMetrics = calcMetrics(data.enrichedTrades, data.positions, data.dailyResults);
      const markFallbackSymbols = new Set<string>(data.markFallbackSymbols);
      if (Array.isArray(rawMetrics.aux?.markFallbackSymbols)) {
        for (const symbol of rawMetrics.aux!.markFallbackSymbols!) {
          markFallbackSymbols.add(symbol);
        }
      }
      const markWarningLabel = data.markWarning ?? rawMetrics.aux?.markWarning ?? null;
      const metrics = normalizeMetrics({
        ...rawMetrics,
        aux: {
          ...rawMetrics.aux,
          markWarning: markWarningLabel ?? undefined,
          staleMarks: markWarningLabel ? true : rawMetrics.aux?.staleMarks,
          markFallbackSymbols: markFallbackSymbols.size
            ? Array.from(markFallbackSymbols)
            : rawMetrics.aux?.markFallbackSymbols,
        },
      });

      useStore.getState().setMetrics(metrics as any);
      setDailyResultsCache(data.dailyResults);

      setTrades(data.trades);
      setPositions(data.positions);
      setEnrichedTrades(data.enrichedTrades);

      if (freezeDate && data.markWarning) {
        setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
      } else {
        setError(null);
      }
      setMarkWarning(markWarningLabel);
    } catch (e) { console.error(e); }
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading Dashboard...</div>;
  }

  return (
    <div>
      {error && (
        <div className="mx-auto my-4 w-11/12 max-w-[var(--page-max)] rounded-md border border-red-500/70 bg-red-900/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {markWarning && (
        <div className="mx-auto my-4 w-11/12 max-w-[var(--page-max)] rounded-md border border-yellow-400/70 bg-yellow-900/40 px-4 py-3 text-sm text-yellow-200">
          当前使用昨收/最近成交价作为临时行情，部分标的 M6 可能略有偏差
        </div>
      )}
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
