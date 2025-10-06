'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findTrades,
  getAllPrices,
  setDailyResultsCache,
} from '@/lib/services/dataService';
import { loadJson } from '@/app/lib/dataSource';
import type { Trade, Position } from '@/lib/services/dataService';
import type { EnrichedTrade } from '@/lib/fifo';
import { applyBreakEvenToPositions, buildEnrichedTrades, replayPortfolio } from '@/app/lib/tradeReplay';
import { DashboardMetrics } from '@/modules/DashboardMetrics';
import { PositionsTable } from '@/modules/PositionsTable';
import { TradesTable } from '@/modules/TradesTable';
import { SymbolTags } from '@/modules/SymbolTags';
import AddTradeModal from '@/components/AddTradeModal';
import Link from 'next/link';
import { calcMetrics, normalizeMetrics } from '@/app/lib/metrics';
import { collectPeriodHealthIssues } from '@/app/lib/dataHealth';
import { useStore } from '@/lib/store';
import { fetchRealtimeQuote, fetchDailyClose, getCachedRealtimeQuote } from '@/lib/services/priceService';
import { logger } from '@/lib/logger';
import { formatNY, getLatestTradingDayStr } from '@/lib/timezone';
import {
  generateDailyResults,
  mergeClosePriceMaps,
  normalizeClosePriceMap,
  closePricesFromRows,
  type DailyResultsDiagnostics,
  type PendingCloseEntry,
  type CloseWindowDiagnostics,
  type MissingCloseFallback,
} from '@/lib/dailyResults';
import { summarizeMissingCloses } from '@/app/lib/missingClose';
import type {
  MissingCloseSummary,
  PeriodHealthIssue,
  PeriodHealthStatus,
} from '@/app/lib/types/health';
import type { MetricsContract } from '@/app/lib/types/metrics';
import { evaluateCloseRequirement } from '@/lib/marketHours';

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
    const price = Number(pos.last);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (pos.priceOk === false) continue;
    if (fallbackMap[symbol] !== undefined) continue;
    fallbackMap[symbol] = price;
  }
  return fallbackMap;
}

async function ensureDailyCloses(symbols: string[], targetDate: string, fallbackCloses?: CloseFallbackMap) {
  if (!symbols.length || !targetDate) return;
  const requirement = evaluateCloseRequirement(targetDate);
  if (!requirement.requireOfficialClose) return;
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

function PendingCloseNotice({
  info,
  closeWindow,
}: {
  info: PendingCloseEntry | null;
  closeWindow: CloseWindowDiagnostics | null;
}) {
  if (!closeWindow) return null;
  if (!closeWindow.isTradingDay) return null;
  if (closeWindow.requireOfficialClose) return null;

  const deadline = closeWindow.windowEndTs
    ? formatNY(closeWindow.windowEndTs, {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null;
  const grace = closeWindow.graceMinutes;
  const fallbackSegments = (info?.details ?? []).map((detail) => {
    const labels = detail.fallbacks
      .map((fallback) => FALLBACK_LABELS[fallback] ?? '')
      .filter(Boolean);
    return `${detail.symbol}${labels.length ? `（${labels.join('、')}）` : ''}`;
  });

  return (
    <div
      style={{
        background: 'rgba(59,130,246,0.12)',
        border: '1px solid rgba(59,130,246,0.4)',
        borderRadius: 8,
        color: '#dbeafe',
        margin: '16px auto 0',
        maxWidth: 'var(--page-max)',
        padding: '14px 16px',
        width: '90%',
      }}
    >
      <h4 style={{ margin: 0, fontSize: '1rem', color: '#bfdbfe' }}>
        今日尚未收盘，估值暂沿用上一交易日收盘价
      </h4>
      <p style={{ margin: '8px 0 0', color: '#e0f2fe', lineHeight: 1.6 }}>
        官方收盘价窗口
        {deadline ? `预计在 ${deadline}` : '尚未结束'}
        {Number.isFinite(grace) && grace > 0 ? `（含宽限 ${grace} 分钟）` : ''}。
        {fallbackSegments.length > 0
          ? ` 当前兜底标的：${fallbackSegments.join('、')}。`
          : ' 稍后将自动补录官方收盘价。'}
      </p>
    </div>
  );
}

const freezeDate = process.env.NEXT_PUBLIC_FREEZE_DATE;

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [enrichedTrades, setEnrichedTrades] = useState<EnrichedTrade[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [missingCloseSummaries, setMissingCloseSummaries] = useState<MissingCloseSummary[]>([]);
  const [missingDismissed, setMissingDismissed] = useState(false);
  const [pendingCloseInfo, setPendingCloseInfo] = useState<PendingCloseEntry | null>(null);
  const [closeWindowInfo, setCloseWindowInfo] = useState<CloseWindowDiagnostics | null>(null);
  const summaryRef = useRef<MissingCloseSummary[]>([]);
  const issuesRef = useRef<PeriodHealthIssue[]>([]);
  const periodMetaRef = useRef<MetricsContract["_period"] | undefined>(
    undefined,
  );
  const setMetrics = useStore((state) => state.setMetrics);
  const setPeriodHealth = useStore((state) => state.setPeriodHealth);

  const syncPeriodHealth = useCallback(
    (options?: { meta?: MetricsContract["_period"] | null }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'meta')) {
        periodMetaRef.current = options.meta ?? undefined;
      }

      const summaries = summaryRef.current;
      const issues = issuesRef.current;
      const meta = periodMetaRef.current;
      const degraded = meta?.degraded;
      const statusMap = meta?.status;
      const hasMissingClose = summaries.length > 0;
      const blockingIssues = issues.filter(
        (item) => item.kind !== 'BASELINE_DELTA_MISSING',
      );
      const partialIssues = issues.filter(
        (item) => item.kind === 'BASELINE_DELTA_MISSING',
      );
      const hasIssues = blockingIssues.length > 0;
      const hasPartialIssues = partialIssues.length > 0;
      const hasDegraded = Boolean(
        degraded && (degraded.wtd || degraded.mtd || degraded.ytd),
      );
      const hasPartialStatus = Object.values(statusMap ?? {}).some(
        (state) => state === 'partial',
      );
      const hasMissingStatus = Object.values(statusMap ?? {}).some(
        (state) => state === 'missing',
      );
      const hasDegradedStatus = Object.values(statusMap ?? {}).some(
        (state) => state === 'degraded',
      );

      if (!hasMissingClose && !hasIssues && !hasDegraded) {
        if (!hasPartialIssues && !hasPartialStatus && !hasMissingStatus && !hasDegradedStatus) {
          setPeriodHealth(null);
          return;
        }
      }

      let status: PeriodHealthStatus = 'ok';
      let origin: 'missing-close-banner' | 'metrics' = 'metrics';

      if (hasMissingClose) {
        const allowIgnore = missingDismissed && !hasIssues;
        status = allowIgnore ? 'ignored' : 'missing';
        origin = allowIgnore
          ? 'metrics'
          : missingDismissed
          ? 'metrics'
          : 'missing-close-banner';
      } else if (hasIssues || hasMissingStatus) {
        status = 'missing';
      } else if (hasDegraded || hasDegradedStatus) {
        status = 'degraded';
      } else if (hasPartialIssues || hasPartialStatus) {
        status = 'partial';
      }

      setPeriodHealth({
        status,
        summaries,
        degraded: hasDegraded ? degraded : undefined,
        origin,
        issues,
      });
    },
    [missingDismissed, setPeriodHealth],
  );

  useEffect(() => {
    syncPeriodHealth();
  }, [missingDismissed, syncPeriodHealth]);

  const clearPeriodHealthState = useCallback(() => {
    summaryRef.current = [];
    issuesRef.current = [];
    periodMetaRef.current = undefined;
    setMissingCloseSummaries([]);
    setMissingDismissed(false);
    setPeriodHealth(null);
  }, [setMissingCloseSummaries, setMissingDismissed, setPeriodHealth]);

  const updateMissingCloseState = useCallback(
    (summaries: MissingCloseSummary[]) => {
      const prev = summaryRef.current;
      if (summaries.length === 0) {
        summaryRef.current = [];
        setMissingCloseSummaries([]);
        if (prev.length > 0) {
          setMissingDismissed(false);
        }
        syncPeriodHealth();
        return;
      }

      if (missingDismissed && !areSummariesEqual(prev, summaries)) {
        setMissingDismissed(false);
      }

      summaryRef.current = summaries.slice();
      setMissingCloseSummaries(summaries);
      syncPeriodHealth();
    },
    [missingDismissed, setMissingCloseSummaries, setMissingDismissed, syncPeriodHealth],
  );

  const handleIgnoreMissing = () => {
    if (summaryRef.current.length === 0) return;
    setMissingDismissed(true);
    syncPeriodHealth();
  };

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setPendingCloseInfo(null);
        setCloseWindowInfo(null);

        await import('@/app/lib/dataset')
          .then(m => m.ensureDatasetReady())
          .catch(err => {
            console.error('Dataset bootstrap failed:', err);
            // Do NOT clear DB on failure; UI may show a non-blocking warning instead.
          });

        const dbTrades = await findTrades();
        const replay = replayPortfolio(dbTrades);
        const enriched = buildEnrichedTrades(replay.baseline);
        const posList: Position[] = replay.positions.map(pos => ({ ...pos }));
        applyBreakEvenToPositions(posList, enriched);

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
          } catch {
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

        if (posList.some(p => p.priceOk === false)) {
          if (freezeDate) {
            setError(`缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`);
          } else {
            setError('无法获取实时价格，指标计算失败');
          }
          clearPeriodHealthState();
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
        setCloseWindowInfo(diagnostics.closeWindow ?? null);
        const pendingEntry = (diagnostics.pendingCloses ?? []).find(
          (entry) => entry.date === evalDateStr,
        ) ?? null;
        setPendingCloseInfo(pendingEntry);
        setDailyResultsCache(dailyResults);

        const summaries = summarizeMissingCloses(diagnostics.missingCloses);
        updateMissingCloseState(summaries);

        // 计算指标并存入全局状态（M6 = M4 + M5.2 + 当日MTM）
        const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
          tradingDateStr: evalDateStr,
          periodEvalYmd: evalDateStr,
        });
        const metrics = normalizeMetrics(rawMetrics);
        issuesRef.current = collectPeriodHealthIssues({
          evalDate: evalDateStr,
          dailyResults,
          trades: dbTrades,
          positions: posList,
          metrics,
        });
        syncPeriodHealth({ meta: rawMetrics?._period ?? null });
        setMetrics(metrics);

        setTrades(dbTrades);
        setPositions(posList);
        setEnrichedTrades(enriched);
      } catch (e) {
        console.error(e);
        clearPeriodHealthState();
        setCloseWindowInfo(null);
        setPendingCloseInfo(null);
        setError(e instanceof Error ? e.message : 'An unknown error occurred.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [
    clearPeriodHealthState,
    setMetrics,
    syncPeriodHealth,
    updateMissingCloseState,
  ]);

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

  async function refreshPricesAndMetrics(
    tradesSnapshot: Trade[],
    evalDateStr: string,
  ): Promise<void> {
    const replay = replayPortfolio(tradesSnapshot);
    const enriched = buildEnrichedTrades(replay.baseline);
    const posList: Position[] = replay.positions.map(pos => ({ ...pos }));
    applyBreakEvenToPositions(posList, enriched);

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
      } catch {
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

    if (posList.some(p => p.priceOk === false)) {
      clearPeriodHealthState();
      throw new Error(
        freezeDate
          ? `缺少 ${freezeDate} 的收盘价，请导入或编辑 close_prices.json`
          : '无法获取实时价格，指标计算失败',
      );
    }

    if (!freezeDate) {
      const symbols = collectSymbols(tradesSnapshot, posList);
      const fallbackCloses = buildCloseFallbacks(posList);
      await ensureDailyCloses(symbols, evalDateStr, fallbackCloses);
    }

    const [fileClosePricesRaw, cachedPrices] = await Promise.all([
      (loadJson('close_prices') as Promise<Record<string, Record<string, number>>>).catch(err => {
        logger.warn('[DashboardPage] 加载 close_prices 缓存失败', err);
        return {} as Record<string, Record<string, number>>;
      }),
      getAllPrices().catch(err => {
        logger.warn('[DashboardPage] 读取价格缓存失败', err);
        return [];
      }),
    ]);

    const cachedFallbackCloses = closePricesFromRows(cachedPrices, {
      includeSources: ['close_fallback'],
    });
    const cachedOfficialCloses = closePricesFromRows(cachedPrices, {
      excludeSources: ['close_fallback'],
    });
    const mergedClosePrices = mergeClosePriceMaps(
      cachedFallbackCloses,
      normalizeClosePriceMap(fileClosePricesRaw),
      cachedOfficialCloses,
    );

    attachPrevClose(posList, mergedClosePrices, evalDateStr);

    const diagnostics: DailyResultsDiagnostics = { missingCloses: [] };
    const dailyResults = generateDailyResults(
      {
        trades: enriched,
        positions: posList,
        closePrices: mergedClosePrices,
        evalDate: evalDateStr,
      },
      diagnostics,
    );
    setCloseWindowInfo(diagnostics.closeWindow ?? null);
    const pendingEntry = (diagnostics.pendingCloses ?? []).find(
      (entry) => entry.date === evalDateStr,
    ) ?? null;
    setPendingCloseInfo(pendingEntry);
    setDailyResultsCache(dailyResults);

    const summaries = summarizeMissingCloses(diagnostics.missingCloses);
    updateMissingCloseState(summaries);

    const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
      tradingDateStr: evalDateStr,
      periodEvalYmd: evalDateStr,
    });
    const metrics = normalizeMetrics(rawMetrics);
    issuesRef.current = collectPeriodHealthIssues({
      evalDate: evalDateStr,
      dailyResults,
      trades: tradesSnapshot,
      positions: posList,
      metrics,
    });
    syncPeriodHealth({ meta: rawMetrics?._period ?? null });
    setMetrics(metrics);

    setTrades(tradesSnapshot);
    setPositions(posList);
    setEnrichedTrades(enriched);
    setRefreshError(null);
  }

  async function reloadData() {
    try {
      const dbTrades = await findTrades();
      const replay = replayPortfolio(dbTrades);
      const enriched = buildEnrichedTrades(replay.baseline);
      const prevBySymbol = new Map(
        positions.map(existing => [existing.symbol?.trim().toUpperCase(), existing] as const),
      );
      const posList: Position[] = replay.positions.map(pos => {
        const clone: Position = { ...pos };
        const cached = getCachedRealtimeQuote(pos.symbol);
        if (cached?.price !== undefined) {
          clone.last = cached.price;
          clone.priceOk = true;
          clone.stale = true;
          clone.lastUpdatedAt = cached.updatedAt;
        } else {
          const prev = prevBySymbol.get(pos.symbol?.trim().toUpperCase());
          if (prev) {
            clone.last = prev.last;
            clone.priceOk = prev.priceOk;
            clone.lastUpdatedAt = prev.lastUpdatedAt;
            clone.stale = true;
          } else {
            clone.priceOk = false;
            clone.stale = true;
          }
        }
        return clone;
      });
      applyBreakEvenToPositions(posList, enriched);

      const evalDateStr = freezeDate ? freezeDate.slice(0, 10) : getLatestTradingDayStr();

      const [fileClosePricesRaw, cachedPrices] = await Promise.all([
        (loadJson('close_prices') as Promise<Record<string, Record<string, number>>>).catch(err => {
          logger.warn('[DashboardPage] 加载 close_prices 缓存失败', err);
          return {} as Record<string, Record<string, number>>;
        }),
        getAllPrices().catch(err => {
          logger.warn('[DashboardPage] 读取价格缓存失败', err);
          return [];
        }),
      ]);

      const cachedFallbackCloses = closePricesFromRows(cachedPrices, {
        includeSources: ['close_fallback'],
      });
      const cachedOfficialCloses = closePricesFromRows(cachedPrices, {
        excludeSources: ['close_fallback'],
      });
      const mergedClosePrices = mergeClosePriceMaps(
        cachedFallbackCloses,
        normalizeClosePriceMap(fileClosePricesRaw),
        cachedOfficialCloses,
      );

      attachPrevClose(posList, mergedClosePrices, evalDateStr);

      const diagnostics: DailyResultsDiagnostics = { missingCloses: [] };
      const dailyResults = generateDailyResults(
        {
          trades: enriched,
          positions: posList,
          closePrices: mergedClosePrices,
          evalDate: evalDateStr,
        },
        diagnostics,
      );
      setCloseWindowInfo(diagnostics.closeWindow ?? null);
      const pendingEntry = (diagnostics.pendingCloses ?? []).find(
        (entry) => entry.date === evalDateStr,
      ) ?? null;
      setPendingCloseInfo(pendingEntry);
      setDailyResultsCache(dailyResults);

      const summaries = summarizeMissingCloses(diagnostics.missingCloses);
      updateMissingCloseState(summaries);

      const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
        tradingDateStr: evalDateStr,
        periodEvalYmd: evalDateStr,
      });
      const metrics = normalizeMetrics(rawMetrics);
      issuesRef.current = collectPeriodHealthIssues({
        evalDate: evalDateStr,
        dailyResults,
        trades: dbTrades,
        positions: posList,
        metrics,
      });
      syncPeriodHealth({ meta: rawMetrics?._period ?? null });
      setMetrics(metrics);

      setTrades(dbTrades);
      setPositions(posList);
      setEnrichedTrades(enriched);

      const backgroundPromise = refreshPricesAndMetrics(dbTrades, evalDateStr);
      void backgroundPromise
        .catch(err => {
          logger.error('[DashboardPage] refreshPricesAndMetrics failed', err);
          setRefreshError(err instanceof Error ? err.message : '刷新交易数据失败');
        })
        .finally(() => {
          setIsRefreshing(false);
        });
    } catch (e) {
      setIsRefreshing(false);
      logger.error('[DashboardPage] reloadData failed', e);
      throw e;
    }
  }

  function handleTradeAdded() {
    setRefreshError(null);
    setIsRefreshing(true);
    void reloadData().catch(err => {
      logger.error('[DashboardPage] 后台刷新交易数据失败', err);
      setRefreshError(err instanceof Error ? err.message : '刷新交易数据失败');
      setIsRefreshing(false);
    });
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading Dashboard...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-destructive">Error: {error}</div>;
  }

  return (
    <div>
      <PendingCloseNotice info={pendingCloseInfo} closeWindow={closeWindowInfo} />
      {missingCloseSummaries.length > 0 && !missingDismissed && (
        <MissingCloseBanner
          summaries={missingCloseSummaries}
          onIgnore={handleIgnoreMissing}
        />
      )}
      {isRefreshing && (
        <div
          style={{
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.4)',
            borderRadius: 8,
            color: '#bfdbfe',
            margin: '12px auto',
            maxWidth: 'var(--page-max)',
            padding: '8px 16px',
            width: '90%',
          }}
        >
          正在后台刷新交易与指标...
        </div>
      )}
      {refreshError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8,
            color: '#fecaca',
            margin: '12px auto',
            maxWidth: 'var(--page-max)',
            padding: '8px 16px',
            width: '90%',
          }}
        >
          后台刷新失败：{refreshError}
        </div>
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
      {showModal && <AddTradeModal onClose={() => setShowModal(false)} onAdded={handleTradeAdded} />}
    </div>
  );
}
