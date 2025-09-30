'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  generateDailyResults,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
  closePricesFromRows,
  type DailyResultsDiagnostics,
  type MissingCloseFallback,
} from '@/lib/dailyResults';
import { summarizeMissingCloses } from '@/app/lib/missingClose';
import type { MissingCloseSummary } from '@/app/lib/types/health';

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
      (pos as any).prevClose = prevClose;
    } else {
      delete (pos as any).prevClose;
    }
  }
}

function collectSymbols(trades: Trade[], positions: Position[]): string[] {
  const symbols = new Set<string>();
  for (const trade of trades) {
    const sym = trade.symbol?.trim().toUpperCase();
    if (sym) symbols.add(sym);
  }
  for (const pos of positions) {
    const sym = pos.symbol?.trim().toUpperCase();
    if (sym) symbols.add(sym);
  }
  return Array.from(symbols).sort();
}

// === PR 侧新增：用持仓最新价构建 fallback 收盘价，并在收盘后窗口补录官方收盘价 ===
type CloseFallbackMap = Record<string, number>;

function buildCloseFallbacks(positions: Position[]): CloseFallbackMap {
  const fallbackMap: CloseFallbackMap = {};
  for (const pos of positions) {
    const symbol = pos.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    const price = Number((pos as any).last);
    if (!Number.isFinite(price) || price <= 0) continue;
    if ((pos as any).priceOk === false) continue;
    if (fallbackMap[symbol] !== undefined) continue;
    fallbackMap[symbol] = price;
  }
  return fallbackMap;
}

async function ensureDailyCloses(symbols: string[], targetDate: string, fallbackCloses?: CloseFallbackMap) {
  if (!symbols.length || !targetDate) return;
  const unique = Array.from(new Set(symbols.map(sym => sym.trim().toUpperCase()).filter(Boolean)));
  if (!unique.length) return;
  await Promise.all(
    unique.map(symbol =>
      fetchDailyClose(symbol, targetDate, {
        fallbackClose: fallbackCloses?.[symbol],
        fallbackSource: 'close_fallback',
      }).catch(err => {
        console.warn('[dashboard] ensureDailyCloses failed', { symbol, date: targetDate, error: err });
        return null;
      }),
    ),
  );
}

const FALLBACK_LABELS: Record<MissingCloseFallback, string> = {
  MARK_PRICE: '使用最新价兜底',
  PREVIOUS_CLOSE: '沿用上一日价格',
  AVERAGE_COST: '使用均价兜底',
};

function areSummariesEqual(
  a: MissingCloseSummary[],
  b: MissingCloseSummary[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.date !== right.date) return false;
    if (left.symbols.length !== right.symbols.length) return false;
    for (let j = 0; j < left.symbols.length; j += 1) {
      const ls = left.symbols[j]!;
      const rs = right.symbols[j]!;
      if (ls.symbol !== rs.symbol) return false;
      if (ls.fallbacks.length !== rs.fallbacks.length) return false;
      for (let k = 0; k < ls.fallbacks.length; k += 1) {
        if (ls.fallbacks[k] !== rs.fallbacks[k]) return false;
      }
    }
  }
  return true;
}

function MissingCloseBanner({
  summaries,
  onIgnore,
}: {
  summaries: MissingCloseSummary[];
  onIgnore: () => void;
}) {
  return (
    <div
      style={{
        background: 'rgba(255, 193, 7, 0.12)',
        border: '1px solid rgba(255, 193, 7, 0.6)',
        borderRadius: '8px',
        color: '#ffd966',
        margin: '20px auto',
        maxWidth: 'var(--page-max)',
        padding: '16px',
        width: '90%',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#ffe08a' }}>收盘价缺失提醒</h3>
      <p style={{ marginTop: 0, marginBottom: '12px', color: '#fff5cc' }}>
        以下日期缺少官方收盘价，请补录到 close_prices.json 或使用导入功能添加。
      </p>
      <ul style={{ paddingLeft: '20px', marginTop: 0, marginBottom: '16px' }}>
        {summaries.map((summary) => (
          <li key={summary.date} style={{ marginBottom: '6px' }}>
            <strong style={{ color: '#ffe08a' }}>{summary.date}</strong>：
            {summary.symbols.map((detail, idx) => {
              const labels = detail.fallbacks
                .map((fb) => FALLBACK_LABELS[fb] ?? '')
                .filter(Boolean);
              return (
                <span key={`${summary.date}-${detail.symbol}`}>
                  {detail.symbol}
                  {labels.length > 0 ? `（${labels.join('、')}）` : ''}
                  {idx < summary.symbols.length - 1 ? '、' : ''}
                </span>
              );
            })}
          </li>
        ))}
      </ul>
      <button className="btn" onClick={onIgnore}>
        忽略并暂时以“待补充”展示
      </button>
    </div>
  );
}

const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [enrichedTrades, setEnrichedTrades] = useState<EnrichedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [missingCloseSummaries, setMissingCloseSummaries] = useState<MissingCloseSummary[]>([]);
  const [missingDismissed, setMissingDismissed] = useState(false);
  const summaryRef = useRef<MissingCloseSummary[]>([]);
  const setMetrics = useStore((state) => state.setMetrics);
  const setPeriodHealth = useStore((state) => state.setPeriodHealth);

  const updateMissingCloseState = (summaries: MissingCloseSummary[]) => {
    const prev = summaryRef.current;
    if (summaries.length === 0) {
      summaryRef.current = [];
      setMissingCloseSummaries([]);
      if (prev.length > 0) {
        setMissingDismissed(false);
      }
      setPeriodHealth(null);
      return;
    }

    let dismissed = missingDismissed;
    if (dismissed && !areSummariesEqual(prev, summaries)) {
      dismissed = false;
      setMissingDismissed(false);
    }

    summaryRef.current = summaries;
    setMissingCloseSummaries(summaries);
    const origin = dismissed ? 'metrics' : 'missing-close-banner';
    setPeriodHealth({
      status: dismissed ? 'ignored' : 'missing',
      summaries,
      origin,
    });
  };

  const handleIgnoreMissing = () => {
    if (summaryRef.current.length === 0) return;
    setMissingDismissed(true);
    setPeriodHealth({
      status: 'ignored',
      summaries: summaryRef.current,
      origin: 'metrics',
    });
  };

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
            (pos as any).last = cached.price;
            (pos as any).priceOk = true;
            (pos as any).stale = true;
            (pos as any).lastUpdatedAt = cached.updatedAt;
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
              (pos as any).last = result.price;
              (pos as any).priceOk = result.priceOk !== false;
              (pos as any).stale = Boolean(result.stale);
              (pos as any).lastUpdatedAt = result.updatedAt ?? Date.now();
            } else if (Number.isFinite((pos as any).last) && (pos as any).lastUpdatedAt) {
              (pos as any).priceOk = true;
              (pos as any).stale = true;
            } else {
              (pos as any).last = NaN;
              (pos as any).priceOk = false;
              (pos as any).stale = true;
            }
          } catch (e) {
            if (Number.isFinite((pos as any).last) && (pos as any).lastUpdatedAt) {
              (pos as any).priceOk = true;
              (pos as any).stale = true;
            } else {
              (pos as any).last = NaN;
              (pos as any).priceOk = false;
              (pos as any).stale = true;
            }
          }
        }

        if (posList.some(p => !(p as any).priceOk)) {
          if (freezeDate) {
            setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
          } else {
            setError('无法获取实时价格，指标计算失败');
          }
          setPeriodHealth(null);
          setIsLoading(false);
          return;
        }

        const evalDateStr = freezeDate ? freezeDate.slice(0, 10) : getLatestTradingDayStr();

        // 收盘后→下次开盘前：用持仓最新价作为 fallback，驱动 fetchDailyClose 自动落盘官方收盘价
        if (!freezeDate) {
          const symbols = collectSymbols(dbTrades, posList);
          const fallbackCloses = buildCloseFallbacks(posList);
          await ensureDailyCloses(symbols, evalDateStr, fallbackCloses);
        }

        const [fileClosePrices, cachedPrices] = await Promise.all([
          loadJson('close_prices') as Promise<Record<string, Record<string, number>>>,
          getAllPrices(),
        ]);
        const cachedFallbackCloses = closePricesFromRows(cachedPrices, {
          includeSources: ["close_fallback"],
        });
        const cachedOfficialCloses = closePricesFromRows(cachedPrices, {
          excludeSources: ["close_fallback"],
        });
        const mergedClosePrices = mergeClosePriceMaps(
          cachedFallbackCloses,
          normalizeClosePriceMap(fileClosePrices),
          cachedOfficialCloses,
        );

        attachPrevClose(posList, mergedClosePrices, evalDateStr);

        const diagnostics: DailyResultsDiagnostics = { missingCloses: [] };
        const dailyResults = generateDailyResults({
          trades: enriched,
          positions: posList,
          closePrices: mergedClosePrices,
          evalDate: evalDateStr,
        }, diagnostics);
        setDailyResultsCache(dailyResults);

        const summaries = summarizeMissingCloses(diagnostics.missingCloses);
        updateMissingCloseState(summaries);

        // 计算指标并存入全局状态（M6 = M4 + M5.2 + 当日MTM）
        const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
          tradingDateStr: evalDateStr,
        });
        const degraded = rawMetrics?._period?.degraded;
        if (degraded && (degraded.wtd || degraded.mtd || degraded.ytd)) {
          setPeriodHealth({
            status: 'degraded',
            summaries: summaryRef.current,
            degraded,
            origin: 'metrics',
          });
        }
        const metrics = normalizeMetrics(rawMetrics);
        setMetrics(metrics as any);

        setTrades(dbTrades);
        setPositions(posList);
        setEnrichedTrades(enriched);
      } catch (e) {
        console.error(e);
        setPeriodHealth(null);
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

  const symbolRealizedPnls = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const trade of enrichedTrades) {
      if (!Number.isFinite(trade.realizedPnl)) continue;
      totals[trade.symbol] = (totals[trade.symbol] ?? 0) + trade.realizedPnl;
    }
    return totals;
  }, [enrichedTrades]);

  async function reloadData() {
    try {
      const dbTrades = await findTrades();
      const replay = replayPortfolio(dbTrades);
      const enriched = buildEnrichedTrades(replay.baseline);
      const posList: Position[] = replay.positions.map(pos => ({ ...pos }));

      for (const pos of posList) {
        const cached = getCachedRealtimeQuote(pos.symbol);
        if (cached?.price !== undefined) {
          (pos as any).last = cached.price;
          (pos as any).priceOk = true;
          (pos as any).stale = true;
          (pos as any).lastUpdatedAt = cached.updatedAt;
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
            (pos as any).last = result.price;
            (pos as any).priceOk = result.priceOk !== false;
            (pos as any).stale = Boolean(result.stale);
            (pos as any).lastUpdatedAt = result.updatedAt ?? Date.now();
          } else if (Number.isFinite((pos as any).last) && (pos as any).lastUpdatedAt) {
            (pos as any).priceOk = true;
            (pos as any).stale = true;
          } else {
            (pos as any).last = NaN;
            (pos as any).priceOk = false;
            (pos as any).stale = true;
          }
        } catch (e) {
          if (Number.isFinite((pos as any).last) && (pos as any).lastUpdatedAt) {
            (pos as any).priceOk = true;
            (pos as any).stale = true;
          } else {
            (pos as any).last = NaN;
            (pos as any).priceOk = false;
            (pos as any).stale = true;
          }
        }
      }

      if (posList.some(p => !(p as any).priceOk)) {
        if (freezeDate) {
          setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
        } else {
          setError('无法获取实时价格，指标计算失败');
        }
        setPeriodHealth(null);
        return;
      }

      const evalDateStr = freezeDate ? freezeDate.slice(0, 10) : getLatestTradingDayStr();

      if (!freezeDate) {
        const symbols = collectSymbols(dbTrades, posList);
        const fallbackCloses = buildCloseFallbacks(posList);
        await ensureDailyCloses(symbols, evalDateStr, fallbackCloses);
      }

      const [fileClosePrices, cachedPrices] = await Promise.all([
        loadJson('close_prices') as Promise<Record<string, Record<string, number>>>,
        getAllPrices(),
      ]);
      const cachedFallbackCloses = closePricesFromRows(cachedPrices, {
        includeSources: ["close_fallback"],
      });
      const cachedOfficialCloses = closePricesFromRows(cachedPrices, {
        excludeSources: ["close_fallback"],
      });
      const mergedClosePrices = mergeClosePriceMaps(
        cachedFallbackCloses,
        normalizeClosePriceMap(fileClosePrices),
        cachedOfficialCloses,
      );

      attachPrevClose(posList, mergedClosePrices, evalDateStr);

      const diagnostics: DailyResultsDiagnostics = { missingCloses: [] };
      const dailyResults = generateDailyResults({
        trades: enriched,
        positions: posList,
        closePrices: mergedClosePrices,
        evalDate: evalDateStr,
      }, diagnostics);
      setDailyResultsCache(dailyResults);

      const summaries = summarizeMissingCloses(diagnostics.missingCloses);
      updateMissingCloseState(summaries);

      // 计算指标并更新全局状态
      const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
        tradingDateStr: evalDateStr,
      });
      const degraded = rawMetrics?._period?.degraded;
      if (degraded && (degraded.wtd || degraded.mtd || degraded.ytd)) {
        setPeriodHealth({
          status: 'degraded',
          summaries: summaryRef.current,
          degraded,
          origin: 'metrics',
        });
      }
      const metrics = normalizeMetrics(rawMetrics);
      setMetrics(metrics as any);

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
      {missingCloseSummaries.length > 0 && !missingDismissed && (
        <MissingCloseBanner
          summaries={missingCloseSummaries}
          onIgnore={handleIgnoreMissing}
        />
      )}
      <DashboardMetrics enrichedTrades={enrichedTrades} positions={positions} />

      <h3 className="section-title" id="positions-title">目前持仓 <Link href="/analysis" className="details">交易分析</Link></h3>
      <PositionsTable positions={positions} trades={enrichedTrades} />

      <h3 className="section-title">个股情况 <Link href="/" className="details" style={{ visibility: 'hidden' }}>详情</Link></h3>
      <SymbolTags symbols={symbolsInTrades} realizedPnls={symbolRealizedPnls} />

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
