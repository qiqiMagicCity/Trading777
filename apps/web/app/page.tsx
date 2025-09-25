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

interface PriceIssue {
  symbol: string;
  level: 'warning' | 'error';
  message: string;
}

function ensureFiniteMark(
  pos: Position,
  defaultMessage: string,
): { next: Position; issue?: PriceIssue } {
  if (Number.isFinite(pos.last)) {
    return { next: pos };
  }
  const fallbackPrice = Number.isFinite(pos.avgPrice) ? Number(pos.avgPrice) : 0;
  const level = pos.priceIssueLevel ?? 'error';
  const message = pos.priceIssueMessage ?? defaultMessage;
  const next: Position = {
    ...pos,
    last: fallbackPrice,
    priceOk: false,
    stale: true,
    priceIssueLevel: level,
    priceIssueMessage: message,
  };
  return {
    next,
    issue: pos.priceIssueMessage
      ? undefined
      : {
          symbol: pos.symbol,
          level,
          message,
        },
  };
}

function mergePriceIssues(base: PriceIssue[], extra: PriceIssue[]): PriceIssue[] {
  const seen = new Set<string>();
  const merged: PriceIssue[] = [];
  for (const issue of [...base, ...extra]) {
    const key = `${issue.symbol}|${issue.level}|${issue.message}`;
    if (seen.has(key)) continue;
    merged.push(issue);
    seen.add(key);
  }
  return merged;
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

function resolveCloseOnOrBefore(
  symbol: string,
  evalDate: string,
  closePrices: Record<string, Record<string, number>>,
): { price: number; date: string } | null {
  const byDate = closePrices[symbol];
  if (!byDate) return null;
  let candidateDate: string | null = null;
  for (const [date, price] of Object.entries(byDate)) {
    if (!Number.isFinite(price)) continue;
    if (date > evalDate) continue;
    if (!candidateDate || date > candidateDate) {
      candidateDate = date;
    }
  }
  if (!candidateDate) return null;
  const price = byDate[candidateDate];
  if (!Number.isFinite(price)) return null;
  return { price: Number(price), date: candidateDate };
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
  const [priceAlerts, setPriceAlerts] = useState<PriceIssue[]>([]);
  const [showModal, setShowModal] = useState(false);

  async function buildDashboardData() {
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

    const issues: PriceIssue[] = [];
    for (const pos of posList) {
      if (!pos.priceOk) {
        const fallback = resolveCloseOnOrBefore(pos.symbol, evalDateStr, mergedClosePrices);
        if (fallback) {
          pos.last = fallback.price;
          pos.stale = true;
          pos.priceIssueLevel = 'warning';
          pos.priceIssueMessage = `实时行情不可用，已使用 ${fallback.date} 的收盘价。`;
        } else {
          pos.last = pos.avgPrice;
          pos.stale = true;
          pos.priceIssueLevel = 'error';
          pos.priceIssueMessage = freezeDate
            ? `缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json。`
            : '实时与历史价格均缺失，已暂用持仓成本估算。';
        }
        issues.push({
          symbol: pos.symbol,
          level: pos.priceIssueLevel ?? 'warning',
          message: pos.priceIssueMessage ?? '实时行情不可用。',
        });
      } else {
        pos.priceIssueLevel = undefined;
        pos.priceIssueMessage = undefined;
      }

      if (!Number.isFinite(pos.last)) {
        const fallbackPrice = Number.isFinite(pos.avgPrice) ? Number(pos.avgPrice) : 0;
        pos.last = fallbackPrice;
        pos.stale = true;
        pos.priceOk = false;
        if (!pos.priceIssueMessage) {
          const message =
            freezeDate
              ? `缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json。`
              : '实时与历史价格均缺失，已暂用持仓成本估算。';
          pos.priceIssueLevel = 'error';
          pos.priceIssueMessage = message;
          issues.push({
            symbol: pos.symbol,
            level: 'error',
            message,
          });
        }
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
      priceIssues: issues,
    };
  }

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        setPriceAlerts([]);

        await import('@/app/lib/ensureBuiltInDatasetLoaded')
          .then(m => m.ensureBuiltInDatasetLoaded())
          .catch(err => {
            console.error('Dataset bootstrap failed:', err);
            // Do NOT clear DB on failure; UI may show a non-blocking warning instead.
          });

        const snapshot = await buildDashboardData();

        setDailyResultsCache(snapshot.dailyResults);

        const degradedMessage = freezeDate
          ? `缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json。`
          : '实时与历史价格均缺失，已暂用持仓成本估算。';

        let metrics;
        let positionsForUi = snapshot.positions;
        let issuesForUi = snapshot.priceIssues;

        try {
          const rawMetrics = calcMetrics(snapshot.enrichedTrades, positionsForUi, snapshot.dailyResults);
          metrics = normalizeMetrics(rawMetrics);
        } catch (err) {
          const extras: PriceIssue[] = [];
          const sanitized = positionsForUi.map(pos => {
            const { next, issue } = ensureFiniteMark(pos, degradedMessage);
            if (issue) extras.push(issue);
            return next;
          });
          try {
            const rawMetrics = calcMetrics(snapshot.enrichedTrades, sanitized, snapshot.dailyResults);
            metrics = normalizeMetrics(rawMetrics);
            positionsForUi = sanitized;
            issuesForUi = mergePriceIssues(issuesForUi, [
              ...extras,
              {
                symbol: '系统',
                level: 'warning',
                message: '部分指标基于估算价格计算，请检查行情服务并补齐缺失价格。',
              },
            ]);
          } catch (fallbackErr) {
            throw err instanceof Error ? err : new Error(String(err));
          }
        }

        useStore.getState().setMetrics(metrics as any);

        setTrades(snapshot.trades);
        setPositions(positionsForUi);
        setEnrichedTrades(snapshot.enrichedTrades);
        setPriceAlerts(issuesForUi);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const symbolsInTrades = useMemo(() => {
    const set = new Set(trades.map(t => t.symbol));
    return Array.from(set);
  }, [trades]);

  async function reloadData() {
    try {
      const snapshot = await buildDashboardData();
      setDailyResultsCache(snapshot.dailyResults);

      const degradedMessage = freezeDate
        ? `缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json。`
        : '实时与历史价格均缺失，已暂用持仓成本估算。';

      let metrics;
      let positionsForUi = snapshot.positions;
      let issuesForUi = snapshot.priceIssues;

      try {
        const rawMetrics = calcMetrics(snapshot.enrichedTrades, positionsForUi, snapshot.dailyResults);
        metrics = normalizeMetrics(rawMetrics);
      } catch (err) {
        const extras: PriceIssue[] = [];
        const sanitized = positionsForUi.map(pos => {
          const { next, issue } = ensureFiniteMark(pos, degradedMessage);
          if (issue) extras.push(issue);
          return next;
        });
        try {
          const rawMetrics = calcMetrics(snapshot.enrichedTrades, sanitized, snapshot.dailyResults);
          metrics = normalizeMetrics(rawMetrics);
          positionsForUi = sanitized;
          issuesForUi = mergePriceIssues(issuesForUi, [
            ...extras,
            {
              symbol: '系统',
              level: 'warning',
              message: '部分指标基于估算价格计算，请检查行情服务并补齐缺失价格。',
            },
          ]);
        } catch (fallbackErr) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }

      useStore.getState().setMetrics(metrics as any);

      setTrades(snapshot.trades);
      setPositions(positionsForUi);
      setEnrichedTrades(snapshot.enrichedTrades);
      setPriceAlerts(issuesForUi);
      setError(null);
    } catch (e) {
      console.error(e);
    }
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading Dashboard...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-destructive">Error: {error}</div>;
  }

  const alertClass = priceAlerts.some(issue => issue.level === 'error') ? 'alert-error' : 'alert-warning';

  return (
    <div>
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      {priceAlerts.length > 0 && (
        <div className={`alert ${alertClass}`}>
          <strong>部分标的的实时价格未能获取</strong>
          <ul className="alert-list">
            {priceAlerts.map(issue => (
              <li key={issue.symbol} className={issue.level}>
                {issue.symbol}：{issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

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
