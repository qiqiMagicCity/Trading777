'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findTrades, setDailyResultsCache } from '@/lib/services/dataService';
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
import { formatNY, nowNY, ymdInNY, startOfWeekNY } from '@/lib/timezone';
import { resolveTradingDayStr } from './lib/nyDay';
import { TradingDayProvider } from './lib/TradingDayContext';
import {
  generateDailyResults,
  buildMissingCloseList,
  type DailyResultsDiagnostics,
  type PendingCloseEntry,
  type CloseWindowDiagnostics,
  type MissingCloseFallback,
  type MissingCloseEntry,
} from '@/lib/dailyResults';
import {
  formatMissingCloseLineTickersOnly,
  summarizeMissingCloses,
} from '@/app/lib/missingClose';
import {
  summarizeMissingOfficialCloses,
  type MissingOfficialDateSummary,
} from '@/app/lib/missingOfficialClose';
import {
  MissingOfficialCloseBanner,
  PendingOfficialCloseBanner,
} from '@/app/modules/OfficialCloseBanners';
import { subscribeOfficialCloseOverlay } from '@/app/lib/officialCloseOverlayStore';
import { buildOfficialCloseMaps } from '@/app/lib/prices/buildOfficialCloseMaps';
import { markPricesReady } from '@/app/lib/prices/ready';
import type {
  MissingCloseSummary,
  PeriodHealthIssue,
  PeriodHealthStatus,
} from '@/app/lib/types/health';
import type { MetricsContract } from '@/app/lib/types/metrics';
import { evaluateCloseRequirement } from '@/lib/marketHours';

/**
 * emitPricesReadyAfterCommit: 以微任务延后发射 pricesReady，确保本轮同步 state 更新（含 setMetrics）已提交。
 * - 在同一事件处理栈内，setMetrics 是同步的；用 microtask/Promise.then 可以保证事件广播滞后于本栈尾部。
 * - 若运行环境无 queueMicrotask，则回退到 Promise.then。
 */
function emitPricesReadyAfterCommit() {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      try {
        markPricesReady();
      } catch {}
    });
  } else {
    Promise.resolve().then(() => {
      try {
        markPricesReady();
      } catch {}
    });
  }
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
    if (left.ymd !== right.ymd) return false;
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

async function toTradingMissingSummaries(
  entries: MissingCloseEntry[],
): Promise<MissingCloseSummary[]> {
  if (!entries.length) {
    return [];
  }
  let min: string | null = null;
  let max: string | null = null;
  for (const entry of entries) {
    const ymd = entry.ymd;
    if (!ymd) continue;
    if (min === null || ymd < min) min = ymd;
    if (max === null || ymd > max) max = ymd;
  }
  if (!min || !max) {
    return [];
  }
  const filtered = await buildMissingCloseList({
    from: min,
    to: max,
    entries,
  });
  return summarizeMissingCloses(filtered);
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
        <a
          href="/debug/close"
          style={{ marginLeft: '8px', color: '#ffe08a', textDecoration: 'underline' }}
        >
          为什么缺价？
        </a>
      </p>
      <ul style={{ paddingLeft: '20px', marginTop: 0, marginBottom: '16px' }}>
        {summaries.map((summary) => {
          const line = formatMissingCloseLineTickersOnly(
            summary.ymd,
            summary.symbols.map((detail) => detail.symbol),
          );
          return (
            <li key={summary.ymd} style={{ marginBottom: '6px' }}>
              {line}
            </li>
          );
        })}
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
  onDismiss,
  dismissed,
}: {
  info: PendingCloseEntry | null;
  closeWindow: CloseWindowDiagnostics | null;
  onDismiss?: () => void;
  dismissed?: boolean;
}) {
  if (!closeWindow) return null;
  if (dismissed) return null;
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
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ flex: 1 }}>
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
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: '1px solid rgba(191,219,254,0.4)',
              borderRadius: 6,
              color: '#bfdbfe',
              cursor: 'pointer',
              flexShrink: 0,
              fontSize: '0.875rem',
              padding: '4px 10px',
            }}
          >
            忽略
          </button>
        )}
      </div>
    </div>
  );
}

const freezeInput = process.env.NEXT_PUBLIC_FREEZE_DATE?.trim() || undefined;

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
  const [missingOfficialSummaries, setMissingOfficialSummaries] =
    useState<MissingOfficialDateSummary[]>([]);
  const [pendingOfficialSummaries, setPendingOfficialSummaries] =
    useState<MissingOfficialDateSummary[]>([]);
  const [pendingCloseInfo, setPendingCloseInfo] = useState<PendingCloseEntry | null>(null);
  const [closeWindowInfo, setCloseWindowInfo] = useState<CloseWindowDiagnostics | null>(null);
  const [pendingNoticeDismissed, setPendingNoticeDismissed] = useState(false);
  const initialTradingDay = useMemo(
    () => resolveTradingDayStr(undefined, { freeze: freezeInput }),
    [freezeInput],
  );
  const freezeTradingDay = freezeInput ? initialTradingDay : undefined;
  const summaryRef = useRef<MissingCloseSummary[]>([]);
  const officialSummaryRef = useRef<MissingOfficialDateSummary[]>([]);
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
      const officialSummaries = officialSummaryRef.current;
      const issues = issuesRef.current;
      const meta = periodMetaRef.current;
      const degraded = meta?.degraded;
      const statusMap = meta?.status;
      const hasMissingClose = summaries.length > 0 || officialSummaries.length > 0;
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
    officialSummaryRef.current = [];
    issuesRef.current = [];
    periodMetaRef.current = undefined;
    setMissingCloseSummaries([]);
    setMissingOfficialSummaries([]);
    setPendingOfficialSummaries([]);
    setMissingDismissed(false);
    setPeriodHealth(null);
  }, [
    setMissingCloseSummaries,
    setMissingOfficialSummaries,
    setPendingOfficialSummaries,
    setMissingDismissed,
    setPeriodHealth,
  ]);

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

  const updateMissingOfficialState = useCallback(
    (summaries: MissingOfficialDateSummary[]) => {
      officialSummaryRef.current = summaries.slice();
      setMissingOfficialSummaries(summaries);
      syncPeriodHealth();
    },
    [setMissingOfficialSummaries, syncPeriodHealth],
  );

  const updatePendingOfficialState = useCallback(
    (summaries: MissingOfficialDateSummary[]) => {
      setPendingOfficialSummaries(summaries);
    },
    [setPendingOfficialSummaries],
  );

  const handleIgnoreMissing = () => {
    if (summaryRef.current.length === 0) return;
    setMissingDismissed(true);
    syncPeriodHealth();
  };

  const loadDashboardData = useCallback(async () => {
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
          if ((result.kind !== 'quote' || !Number.isFinite(result.price) || result.price === 1) && !freezeInput) {
            const today = resolveTradingDayStr();
            const dailyClose = await fetchDailyClose(pos.symbol, today);
            if (dailyClose && dailyClose.kind === 'quote' && Number.isFinite(dailyClose.price)) {
              result = { ...dailyClose, priceOk: dailyClose.priceOk ?? true };
            }
          }

          if (result.kind === 'quote' && Number.isFinite(result.price) && result.price !== 1) {
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
        if (freezeInput) {
          setError(`缺少 ${freezeTradingDay} 的收盘价，请导入或编辑 close_prices.json`);
        } else {
          setError('无法获取实时价格，指标计算失败');
        }
        clearPeriodHealthState();
        setIsLoading(false);
        return;
      }

      const evalDateStr = freezeTradingDay ?? resolveTradingDayStr();

      if (!freezeInput) {
        const symbols = collectSymbols(dbTrades, posList);
        const fallbackCloses = buildCloseFallbacks(posList);
        await ensureDailyCloses(symbols, evalDateStr, fallbackCloses);
      }

      const { overlay: overlayMap, official: officialClosePrices, merged: mergedClosePrices } =
        await buildOfficialCloseMaps();
      emitPricesReadyAfterCommit();

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

      const summaries = await toTradingMissingSummaries(
        diagnostics.missingCloses,
      );
      updateMissingCloseState(summaries);

      const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
        tradingDateStr: evalDateStr,
        periodEvalYmd: evalDateStr,
        officialCloseMap: officialClosePrices,
        officialCloseOverlayMap: overlayMap,
      });
      const metrics = normalizeMetrics(rawMetrics);
      const officialSummaries = summarizeMissingOfficialCloses(
        metrics.diagnostics?.missingOfficialCloses ?? [],
      );
      updateMissingOfficialState(officialSummaries);
      const pendingSummaries = summarizeMissingOfficialCloses(
        metrics.diagnostics?.pendingOfficialCloses ?? [],
      );
      updatePendingOfficialState(pendingSummaries);
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
  }, [
    clearPeriodHealthState,
    setMetrics,
    syncPeriodHealth,
    updateMissingCloseState,
    updatePendingOfficialState,
    updateMissingOfficialState,
    freezeInput,
    freezeTradingDay,
  ]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const unsubscribe = subscribeOfficialCloseOverlay(() => {
      void loadDashboardData();
    });
    return unsubscribe;
  }, [loadDashboardData]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => {
      void loadDashboardData();
    };
    window.addEventListener('pricesImported', handler);
    window.addEventListener('pricesReady', handler);
    return () => {
      window.removeEventListener('pricesImported', handler);
      window.removeEventListener('pricesReady', handler);
    };
  }, [loadDashboardData]);

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
        if ((result.kind !== 'quote' || !Number.isFinite(result.price) || result.price === 1) && !freezeInput) {
          const today = resolveTradingDayStr();
          const dailyClose = await fetchDailyClose(pos.symbol, today);
          if (dailyClose && dailyClose.kind === 'quote' && Number.isFinite(dailyClose.price)) {
            result = { ...dailyClose, priceOk: dailyClose.priceOk ?? true };
          }
        }
        if (result.kind === 'quote' && Number.isFinite(result.price) && result.price !== 1) {
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
        freezeInput
          ? `缺少 ${freezeTradingDay} 的收盘价，请导入或编辑 close_prices.json`
          : '无法获取实时价格，指标计算失败',
      );
    }

    if (!freezeInput) {
      const symbols = collectSymbols(tradesSnapshot, posList);
      const fallbackCloses = buildCloseFallbacks(posList);
      await ensureDailyCloses(symbols, evalDateStr, fallbackCloses);
    }

    const { overlay: overlayMap, merged: mergedClosePrices, official: officialCloseMap } =
      await buildOfficialCloseMaps();
    emitPricesReadyAfterCommit();

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

    const summaries = await toTradingMissingSummaries(
      diagnostics.missingCloses,
    );
    updateMissingCloseState(summaries);

    const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
      tradingDateStr: evalDateStr,
      periodEvalYmd: evalDateStr,
      officialCloseMap: officialCloseMap,
      officialCloseOverlayMap: overlayMap,
    });
    const metrics = normalizeMetrics(rawMetrics);
    const pendingOfficial = summarizeMissingOfficialCloses(
      metrics.diagnostics?.pendingOfficialCloses ?? [],
    );
    updatePendingOfficialState(pendingOfficial);
    const missingOfficial = summarizeMissingOfficialCloses(
      metrics.diagnostics?.missingOfficialCloses ?? [],
    );
    updateMissingOfficialState(missingOfficial);
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

      const evalDateStr = freezeTradingDay ?? resolveTradingDayStr();

      const { overlay: overlayMap, merged: mergedClosePrices, official: officialCloseMap } =
        await buildOfficialCloseMaps();
      emitPricesReadyAfterCommit();

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
      setPendingNoticeDismissed(false);
      setDailyResultsCache(dailyResults);

      const summaries = await toTradingMissingSummaries(
        diagnostics.missingCloses,
      );
      updateMissingCloseState(summaries);

      const rawMetrics = calcMetrics(enriched, posList, dailyResults, {
        tradingDateStr: evalDateStr,
        periodEvalYmd: evalDateStr,
        officialCloseMap: officialCloseMap,
        officialCloseOverlayMap: overlayMap,
      });
      const metrics = normalizeMetrics(rawMetrics);
      const pendingOfficial = summarizeMissingOfficialCloses(
        metrics.diagnostics?.pendingOfficialCloses ?? [],
      );
      updatePendingOfficialState(pendingOfficial);
      const missingOfficial = summarizeMissingOfficialCloses(
        metrics.diagnostics?.missingOfficialCloses ?? [],
      );
      updateMissingOfficialState(missingOfficial);
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
    <TradingDayProvider initialTradingDay={initialTradingDay}>
      <div data-trading-day={initialTradingDay}>
      <PendingCloseNotice
        info={pendingCloseInfo}
        closeWindow={closeWindowInfo}
        dismissed={pendingNoticeDismissed}
        onDismiss={() => setPendingNoticeDismissed(true)}
      />
      {pendingOfficialSummaries.length > 0 && (
        <PendingOfficialCloseBanner summaries={pendingOfficialSummaries} />
      )}
      {missingOfficialSummaries.length > 0 && (
        <MissingOfficialCloseBanner summaries={missingOfficialSummaries} />
      )}
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
    </TradingDayProvider>
  );
}
