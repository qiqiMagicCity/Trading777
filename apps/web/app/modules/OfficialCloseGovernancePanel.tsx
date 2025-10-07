'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { summarizeMissingOfficialCloses } from '@/app/lib/missingOfficialClose';
import type { MissingOfficialDateSummary } from '@/app/lib/missingOfficialClose';
import type { MetricsContract } from '@/app/lib/types/metrics';
import {
  putOfficialCloseOverlays,
  readOfficialCloseOverlay,
  removeOfficialCloseOverlay,
  type OfficialCloseOverlayRecord,
} from '@/app/lib/officialCloseOverlayStore';
import { getAdjustmentFactor } from '@/app/lib/officialCloseAdjustments';

interface GovernanceFilters {
  status?: 'all' | 'missing' | 'pending';
  from?: string;
  to?: string;
  symbols?: string[];
  impacts?: string[];
}

type OfficialCloseStatus = 'missing' | 'pending';

interface GovernanceRow {
  date: string;
  symbol: string;
  status: OfficialCloseStatus;
  purposes: string[];
  impact: string[];
  hasFallback: boolean;
  firstDetectedAt?: string;
  lastDetectedAt?: string;
  adjFactor: number;
}

interface OverlayRow extends OfficialCloseOverlayRecord {
  key: string;
}

interface ImportEntry {
  symbol: string;
  date: string;
  price: number;
}

const STATUS_LABELS: Record<OfficialCloseStatus, string> = {
  missing: '黄条',
  pending: '蓝条',
};

const toArray = (values?: string[]): string[] =>
  Array.isArray(values) ? values.filter(Boolean) : [];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function formatTimestamp(value?: string): string {
  if (!value) return '--';
  return value.replace('T', ' ').replace('Z', '');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function flattenSummaries(
  summaries: MissingOfficialDateSummary[],
  status: OfficialCloseStatus,
  evalDate: string,
): GovernanceRow[] {
  const rows: GovernanceRow[] = [];
  for (const summary of summaries) {
    for (const symbol of summary.symbols) {
      const factor =
        evalDate && DATE_RE.test(evalDate)
          ? getAdjustmentFactor(symbol.symbol, summary.date, evalDate)
          : 1;
      rows.push({
        date: summary.date,
        symbol: symbol.symbol,
        status,
        purposes: [...symbol.purposes],
        impact: [...symbol.impact],
        hasFallback: symbol.hasFallback,
        ...(symbol.firstDetectedAt ? { firstDetectedAt: symbol.firstDetectedAt } : {}),
        ...(symbol.lastDetectedAt ? { lastDetectedAt: symbol.lastDetectedAt } : {}),
        adjFactor: Number.isFinite(factor) ? factor : 1,
      });
    }
  }
  return rows;
}

function parseImportText(raw: string): ImportEntry[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const map = new Map<string, ImportEntry>();
  for (const line of lines) {
    const tokens = line.split(/[\s,]+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length < 3) continue;
    const [symbolRaw, dateRaw, priceRaw] = tokens;
    const symbol = normalizeSymbol(symbolRaw);
    const date = dateRaw.slice(0, 10);
    const price = Number(priceRaw);
    if (!symbol || !DATE_RE.test(date) || !Number.isFinite(price) || price <= 0) {
      continue;
    }
    map.set(`${symbol}|${date}`, { symbol, date, price });
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.symbol.localeCompare(b.symbol);
  });
}

function formatAdjFactor(value: number): string {
  return Number.isFinite(value) ? value.toFixed(4) : '1.0000';
}

export interface OfficialCloseGovernancePanelProps {
  metrics: MetricsContract | null;
  initialFilters?: GovernanceFilters;
  evalDate?: string;
  onOverlayChange?: () => Promise<void> | void;
}

export function OfficialCloseGovernancePanel({
  metrics,
  initialFilters,
  evalDate: evalDateProp,
  onOverlayChange,
}: OfficialCloseGovernancePanelProps) {
  const missingSummaries = useMemo(
    () =>
      summarizeMissingOfficialCloses(
        metrics?.diagnostics?.missingOfficialCloses ?? [],
      ),
    [metrics?.diagnostics?.missingOfficialCloses],
  );
  const pendingSummaries = useMemo(
    () =>
      summarizeMissingOfficialCloses(
        metrics?.diagnostics?.pendingOfficialCloses ?? [],
      ),
    [metrics?.diagnostics?.pendingOfficialCloses],
  );

  const inferredEvalDate = useMemo(() => {
    if (evalDateProp) return evalDateProp;
    const diagnostics = metrics?._period?.diagnostics;
    return (
      diagnostics?.wtd?.periodEvalYmd ??
      diagnostics?.mtd?.periodEvalYmd ??
      diagnostics?.ytd?.periodEvalYmd ??
      ''
    );
  }, [evalDateProp, metrics?._period?.diagnostics]);

  const allRows = useMemo(() => {
    const rows = [
      ...flattenSummaries(missingSummaries, 'missing', inferredEvalDate),
      ...flattenSummaries(pendingSummaries, 'pending', inferredEvalDate),
    ];
    return rows.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.symbol.localeCompare(b.symbol);
    });
  }, [missingSummaries, pendingSummaries, inferredEvalDate]);

  const allSymbols = useMemo(
    () => uniqueSorted(allRows.map((row) => row.symbol)),
    [allRows],
  );
  const allImpacts = useMemo(
    () => uniqueSorted(allRows.flatMap((row) => row.impact)),
    [allRows],
  );

  const [statusFilter, setStatusFilter] = useState<'all' | OfficialCloseStatus>(
    initialFilters?.status ?? 'all',
  );
  const [dateFrom, setDateFrom] = useState(initialFilters?.from ?? '');
  const [dateTo, setDateTo] = useState(initialFilters?.to ?? '');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    toArray(initialFilters?.symbols),
  );
  const [selectedImpacts, setSelectedImpacts] = useState<string[]>(
    toArray(initialFilters?.impacts),
  );
  const [showAdjFactor, setShowAdjFactor] = useState(false);

  useEffect(() => {
    if (!initialFilters) return;
    setStatusFilter(initialFilters.status ?? 'all');
    setDateFrom(initialFilters.from ?? '');
    setDateTo(initialFilters.to ?? '');
    setSelectedSymbols(toArray(initialFilters.symbols));
    setSelectedImpacts(toArray(initialFilters.impacts));
  }, [
    initialFilters?.status,
    initialFilters?.from,
    initialFilters?.to,
    initialFilters?.symbols,
    initialFilters?.impacts,
  ]);

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }
      if (dateFrom && row.date < dateFrom) {
        return false;
      }
      if (dateTo && row.date > dateTo) {
        return false;
      }
      if (selectedSymbols.length && !selectedSymbols.includes(row.symbol)) {
        return false;
      }
      if (
        selectedImpacts.length &&
        !selectedImpacts.every((impact) => row.impact.includes(impact))
      ) {
        return false;
      }
      return true;
    });
  }, [allRows, statusFilter, dateFrom, dateTo, selectedSymbols, selectedImpacts]);

  const handleSymbolsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = Array.from(event.target.selectedOptions).map(
      (option) => option.value,
    );
    setSelectedSymbols(next);
  };

  const handleImpactsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = Array.from(event.target.selectedOptions).map(
      (option) => option.value,
    );
    setSelectedImpacts(next);
  };

  const [overlayRows, setOverlayRows] = useState<OverlayRow[]>([]);
  const [overlayLoading, setOverlayLoading] = useState<boolean>(true);
  const [selectedOverlayKeys, setSelectedOverlayKeys] = useState<string[]>([]);

  const refreshOverlay = useCallback(async () => {
    setOverlayLoading(true);
    try {
      const entries = await readOfficialCloseOverlay();
      setOverlayRows(
        entries.map((entry) => ({
          ...entry,
          key: `${normalizeSymbol(entry.symbol)}|${entry.date}`,
        })),
      );
    } catch (err) {
      console.error('[GovernancePanel] 读取覆盖层失败', err);
    } finally {
      setOverlayLoading(false);
    }
  }, []);

  const notifyOverlayChange = useCallback(async () => {
    await refreshOverlay();
    if (typeof onOverlayChange === 'function') {
      await onOverlayChange();
    }
  }, [refreshOverlay, onOverlayChange]);

  useEffect(() => {
    void refreshOverlay();
  }, [refreshOverlay]);

  useEffect(() => {
    if (selectedOverlayKeys.length === 0) return;
    const keySet = new Set(overlayRows.map((row) => row.key));
    setSelectedOverlayKeys((prev) => prev.filter((key) => keySet.has(key)));
  }, [overlayRows, selectedOverlayKeys.length]);

  const handleExport = useCallback(() => {
    if (typeof window === 'undefined') return;
    const header = [
      '日期',
      '标的',
      '状态',
      '影响面',
      '用途',
      '存在兜底',
      '首次出现',
      '最近检测',
      'adjFactor',
    ];
    const lines = [header.join(',')];
    for (const row of filteredRows) {
      const impact = row.impact.join(';');
      const purposes = row.purposes.join(';');
      lines.push(
        [
          row.date,
          row.symbol,
          STATUS_LABELS[row.status],
          impact,
          purposes,
          row.hasFallback ? '是' : '否',
          row.firstDetectedAt ?? '',
          row.lastDetectedAt ?? '',
          formatAdjFactor(row.adjFactor),
        ]
          .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    const csvContent = '\ufeff' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `official_close_gaps_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredRows]);

  const [isImportOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportEntry[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importForm, setImportForm] = useState({ symbol: '', date: '', price: '' });

  const openImportDialog = () => {
    setImportOpen(true);
    setImportPreview([]);
    setImportError(null);
  };

  const closeImportDialog = () => {
    setImportOpen(false);
    setImportPreview([]);
    setImportError(null);
    setImportForm({ symbol: '', date: '', price: '' });
  };

  const addImportEntries = (entries: ImportEntry[]) => {
    const map = new Map<string, ImportEntry>();
    for (const entry of [...importPreview, ...entries]) {
      const symbol = normalizeSymbol(entry.symbol);
      const date = entry.date.slice(0, 10);
      if (!symbol || !DATE_RE.test(date) || entry.price <= 0) continue;
      map.set(`${symbol}|${date}`, { symbol, date, price: entry.price });
    }
    setImportPreview(Array.from(map.values()));
  };

  const handleImportTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const entries = parseImportText(event.target.value ?? '');
    addImportEntries(entries);
    setImportError(null);
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseImportText(text);
      if (!entries.length) {
        setImportError('文件内容无法解析为有效的 symbol,date,price 列');
        return;
      }
      addImportEntries(entries);
      setImportError(null);
    } catch (err) {
      console.error('[GovernancePanel] 读取导入文件失败', err);
      setImportError('读取文件失败，请重试');
    } finally {
      event.target.value = '';
    }
  };

  const handleManualAdd = () => {
    const symbol = normalizeSymbol(importForm.symbol);
    const date = importForm.date.slice(0, 10);
    const price = Number(importForm.price);
    if (!symbol || !DATE_RE.test(date) || !Number.isFinite(price) || price <= 0) {
      setImportError('请填写有效的标的、日期与价格');
      return;
    }
    addImportEntries([{ symbol, date, price }]);
    setImportForm({ symbol: '', date: '', price: '' });
    setImportError(null);
  };

  const handleRemovePreview = (key: string) => {
    setImportPreview((prev) => prev.filter((entry) => `${entry.symbol}|${entry.date}` !== key));
  };

  const handleConfirmImport = async () => {
    if (!importPreview.length) {
      setImportError('请先添加至少一条官方价记录');
      return;
    }
    try {
      await putOfficialCloseOverlays(importPreview);
      closeImportDialog();
      await notifyOverlayChange();
    } catch (err) {
      console.error('[GovernancePanel] 导入覆盖层失败', err);
      setImportError(err instanceof Error ? err.message : '导入失败，请重试');
    }
  };

  const toggleOverlaySelection = (key: string, checked: boolean) => {
    setSelectedOverlayKeys((prev) => {
      const set = new Set(prev);
      if (checked) {
        set.add(key);
      } else {
        set.delete(key);
      }
      return Array.from(set);
    });
  };

  const handleRemoveSelectedOverlay = useCallback(async () => {
    if (!selectedOverlayKeys.length) return;
    try {
      await Promise.all(
        selectedOverlayKeys.map((key) => {
          const [symbol, date] = key.split('|');
          return removeOfficialCloseOverlay({ symbol, date });
        }),
      );
      setSelectedOverlayKeys([]);
      await notifyOverlayChange();
    } catch (err) {
      console.error('[GovernancePanel] 删除覆盖层失败', err);
      window.alert('删除覆盖层失败，请重试。');
    }
  }, [selectedOverlayKeys, notifyOverlayChange]);

  const resetFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setSelectedSymbols([]);
    setSelectedImpacts([]);
  };

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: 12,
        color: '#f1f5f9',
        padding: '24px',
      }}
      data-testid="official-close-governance-panel"
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>缺口治理面板</h2>
          {inferredEvalDate ? (
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              评估日：{inferredEvalDate}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExport}
            data-testid="governance-export"
            style={{
              background: '#38bdf8',
              border: 'none',
              borderRadius: 6,
              color: '#0f172a',
              cursor: 'pointer',
              padding: '8px 14px',
            }}
          >
            导出 CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAdjFactor((prev) => !prev)}
            data-testid="toggle-adj-factor"
            style={{
              background: '#1d4ed8',
              border: 'none',
              borderRadius: 6,
              color: '#e0f2fe',
              cursor: 'pointer',
              padding: '8px 14px',
            }}
          >
            {showAdjFactor ? '隐藏调整因子' : '显示调整因子'}
          </button>
          <button
            type="button"
            onClick={openImportDialog}
            data-testid="governance-go-import"
            style={{
              background: '#34d399',
              border: 'none',
              borderRadius: 6,
              color: '#022c22',
              cursor: 'pointer',
              padding: '8px 14px',
            }}
          >
            去补录
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '12px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          marginBottom: '20px',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          状态
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | OfficialCloseStatus)
            }
            data-testid="filter-status"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              padding: '6px 8px',
            }}
          >
            <option value="all">全部</option>
            <option value="missing">黄条（缺官方价）</option>
            <option value="pending">蓝条（等待落地）</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          起始日期
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            data-testid="filter-from"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              padding: '6px 8px',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          截止日期
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            data-testid="filter-to"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              padding: '6px 8px',
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          标的（可多选）
          <select
            multiple
            value={selectedSymbols}
            onChange={handleSymbolsChange}
            data-testid="filter-symbols"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              minHeight: '80px',
              padding: '6px 8px',
            }}
          >
            {allSymbols.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          影响面（可多选）
          <select
            multiple
            value={selectedImpacts}
            onChange={handleImpactsChange}
            data-testid="filter-impacts"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#e2e8f0',
              minHeight: '80px',
              padding: '6px 8px',
            }}
          >
            {allImpacts.map((impact) => (
              <option key={impact} value={impact}>
                {impact}
              </option>
            ))}
          </select>
        </label>
        <div style={{ alignSelf: 'flex-end' }}>
          <button
            type="button"
            onClick={resetFilters}
            data-testid="filter-reset"
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              borderRadius: 6,
              color: '#e2e8f0',
              cursor: 'pointer',
              padding: '6px 12px',
            }}
          >
            重置筛选
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}
          data-testid="governance-table"
        >
          <thead>
            <tr>
              {[
                '日期',
                '标的',
                '状态',
                '影响面',
                '用途',
                '兜底',
                '首次出现',
                '最近检测',
                ...(showAdjFactor ? ['adjFactor'] : []),
              ].map((header) => (
                <th
                  key={header}
                  style={{
                    borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
                    padding: '8px 6px',
                    textAlign: 'left',
                  }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={showAdjFactor ? 9 : 8} style={{ padding: '12px 6px', color: '#cbd5f5' }}>
                  暂无符合条件的缺口。
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={`${row.date}-${row.symbol}-${row.status}`}>
                  <td style={{ padding: '8px 6px' }}>{row.date}</td>
                  <td style={{ padding: '8px 6px' }}>{row.symbol}</td>
                  <td style={{ padding: '8px 6px' }}>{STATUS_LABELS[row.status]}</td>
                  <td style={{ padding: '8px 6px' }}>
                    {row.impact.length ? row.impact.join('、') : '—'}
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    {row.purposes.length ? row.purposes.join('、') : '—'}
                  </td>
                  <td style={{ padding: '8px 6px' }}>{row.hasFallback ? '是' : '否'}</td>
                  <td style={{ padding: '8px 6px' }}>{formatTimestamp(row.firstDetectedAt)}</td>
                  <td style={{ padding: '8px 6px' }}>{formatTimestamp(row.lastDetectedAt)}</td>
                  {showAdjFactor ? (
                    <td style={{ padding: '8px 6px' }}>{formatAdjFactor(row.adjFactor)}</td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '24px' }}>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>官方收盘价覆盖层</h3>
          <button
            type="button"
            onClick={handleRemoveSelectedOverlay}
            data-testid="overlay-remove-selected"
            disabled={selectedOverlayKeys.length === 0}
            style={{
              background: selectedOverlayKeys.length ? '#f87171' : '#334155',
              border: 'none',
              borderRadius: 6,
              color: '#0f172a',
              cursor: selectedOverlayKeys.length ? 'pointer' : 'not-allowed',
              padding: '6px 12px',
            }}
          >
            删除选中覆盖
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}
            data-testid="overlay-table"
          >
            <thead>
              <tr>
                {['选择', '日期', '标的', '价格', '创建时间', '最近更新'].map((header) => (
                  <th
                    key={header}
                    style={{
                      borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
                      padding: '6px 4px',
                      textAlign: header === '价格' ? 'right' : 'left',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overlayLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '12px 6px', color: '#cbd5f5' }}>
                    覆盖层数据加载中…
                  </td>
                </tr>
              ) : overlayRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '12px 6px', color: '#cbd5f5' }}>
                    当前没有覆盖层记录。
                  </td>
                </tr>
              ) : (
                overlayRows.map((row) => (
                  <tr key={row.key}>
                    <td style={{ padding: '6px 4px' }}>
                      <input
                        type="checkbox"
                        checked={selectedOverlayKeys.includes(row.key)}
                        onChange={(event) =>
                          toggleOverlaySelection(row.key, event.target.checked)
                        }
                      />
                    </td>
                    <td style={{ padding: '6px 4px' }}>{row.date}</td>
                    <td style={{ padding: '6px 4px' }}>{normalizeSymbol(row.symbol)}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                      {row.price.toFixed(4)}
                    </td>
                    <td style={{ padding: '6px 4px' }}>{formatTimestamp(row.tsCreated ? new Date(row.tsCreated).toISOString() : '')}</td>
                    <td style={{ padding: '6px 4px' }}>{formatTimestamp(row.tsUpdated ? new Date(row.tsUpdated).toISOString() : '')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isImportOpen ? (
        <div
          style={{
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.82)',
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            left: 0,
            position: 'fixed',
            right: 0,
            top: 0,
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 12,
              maxWidth: 720,
              padding: '24px',
              width: '90%',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>补录官方收盘价</h3>
              <button
                type="button"
                onClick={closeImportDialog}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                }}
              >
                ×
              </button>
            </div>
            <p style={{ color: '#94a3b8', marginTop: 0 }}>
              支持 CSV 粘贴或文件上传（列顺序：symbol,date,price），也可通过下方表单逐条添加。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                placeholder="AAPL,2024-01-02,182.63"
                onChange={handleImportTextChange}
                data-testid="overlay-import-textarea"
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  minHeight: 100,
                  padding: '8px 10px',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportFile}
                  data-testid="overlay-import-file"
                  style={{ color: '#e2e8f0' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={importForm.symbol}
                  onChange={(event) =>
                    setImportForm((prev) => ({ ...prev, symbol: event.target.value }))
                  }
                  placeholder="标的"
                  data-testid="overlay-import-symbol"
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#e2e8f0',
                    padding: '6px 8px',
                    flex: '1 1 120px',
                  }}
                />
                <input
                  type="date"
                  value={importForm.date}
                  onChange={(event) =>
                    setImportForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  data-testid="overlay-import-date"
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#e2e8f0',
                    padding: '6px 8px',
                    flex: '1 1 140px',
                  }}
                />
                <input
                  type="number"
                  step="0.0001"
                  value={importForm.price}
                  onChange={(event) =>
                    setImportForm((prev) => ({ ...prev, price: event.target.value }))
                  }
                  placeholder="价格"
                  data-testid="overlay-import-price"
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    color: '#e2e8f0',
                    padding: '6px 8px',
                    flex: '1 1 120px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleManualAdd}
                  data-testid="overlay-import-manual-add"
                  style={{
                    background: '#38bdf8',
                    border: 'none',
                    borderRadius: 6,
                    color: '#0f172a',
                    cursor: 'pointer',
                    padding: '6px 12px',
                  }}
                >
                  添加
                </button>
              </div>
              {importError ? (
                <p style={{ color: '#fca5a5', margin: 0 }}>{importError}</p>
              ) : null}
              <div style={{
                border: '1px solid #334155',
                borderRadius: 8,
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      {['标的', '日期', '价格', '操作'].map((header) => (
                        <th
                          key={header}
                          style={{
                            borderBottom: '1px solid rgba(148, 163, 184, 0.4)',
                            padding: '6px 8px',
                            textAlign: header === '价格' ? 'right' : 'left',
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '10px', color: '#94a3b8' }}>
                          尚未添加任何补录记录。
                        </td>
                      </tr>
                    ) : (
                      importPreview.map((entry) => (
                        <tr key={`${entry.symbol}|${entry.date}`}>
                          <td style={{ padding: '6px 8px' }}>{entry.symbol}</td>
                          <td style={{ padding: '6px 8px' }}>{entry.date}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            {entry.price.toFixed(4)}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemovePreview(`${entry.symbol}|${entry.date}`)
                              }
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#fca5a5',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={closeImportDialog}
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    borderRadius: 6,
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    padding: '6px 12px',
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  data-testid="overlay-import-confirm"
                  style={{
                    background: '#34d399',
                    border: 'none',
                    borderRadius: 6,
                    color: '#022c22',
                    cursor: 'pointer',
                    padding: '6px 12px',
                  }}
                >
                  确认补录
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
