'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OfficialCloseGovernancePanel } from '@/modules/OfficialCloseGovernancePanel';
import { fetchSummaryMetrics, normalizeMetrics } from '@/app/lib/metrics';
import type { MetricsContract } from '@/app/lib/types/metrics';
import { useStore } from '@/lib/store';

function parseQueryList(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const joined = values.flatMap((value) => value.split(',').map((token) => token.trim()));
  return Array.from(new Set(joined.filter(Boolean)));
}

export default function OfficialCloseGovernancePage() {
  const searchParams = useSearchParams();
  const storeMetrics = useStore((state) => state.metrics);
  const setMetrics = useStore((state) => state.setMetrics);
  const [metrics, setLocalMetrics] = useState<MetricsContract | null>(
    storeMetrics ?? null,
  );
  const [loading, setLoading] = useState<boolean>(!storeMetrics);
  const [error, setError] = useState<string | null>(null);

  const refreshMetrics = useCallback(async () => {
    try {
      const summary = await fetchSummaryMetrics();
      const normalized = normalizeMetrics(summary);
      setLocalMetrics(normalized);
      setMetrics(normalized);
    } catch (err) {
      console.error('[official-close page] refresh metrics failed', err);
    }
  }, [setMetrics]);

  useEffect(() => {
    if (storeMetrics) {
      setLocalMetrics(storeMetrics);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSummaryMetrics()
      .then((summary) => {
        if (cancelled) return;
        const normalized = normalizeMetrics(summary);
        setLocalMetrics(normalized);
        setMetrics(normalized);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err ?? '未知错误');
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setMetrics, storeMetrics]);

  const initialFilters = useMemo(() => {
    if (!searchParams) {
      return undefined;
    }
    const statusParam = searchParams.get('status');
    const status: 'all' | 'missing' | 'pending' =
      statusParam === 'missing' || statusParam === 'pending'
        ? statusParam
        : 'all';
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const symbolParams = parseQueryList([
      ...searchParams.getAll('symbols'),
      ...searchParams.getAll('symbol'),
    ]);
    const impactParams = parseQueryList([
      ...searchParams.getAll('impacts'),
      ...searchParams.getAll('impact'),
    ]);
    return {
      status,
      from,
      to,
      symbols: symbolParams,
      impacts: impactParams,
    };
  }, [searchParams]);

  return (
    <div
      style={{
        margin: '24px auto',
        maxWidth: 'var(--page-max)',
        padding: '0 24px 48px',
      }}
    >
      <h1 style={{ color: '#0f172a', fontSize: '2rem', marginBottom: '16px' }}>
        官方收盘价缺口治理
      </h1>
      {loading ? (
        <p style={{ color: '#475569' }}>加载缺口数据中…</p>
      ) : error ? (
        <p style={{ color: '#dc2626' }}>加载失败：{error}</p>
      ) : (
        <OfficialCloseGovernancePanel
          metrics={metrics}
          initialFilters={initialFilters}
          onOverlayChange={refreshMetrics}
        />
      )}
    </div>
  );
}
