/** @jest-environment jsdom */

import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

import { DashboardMetrics } from '../DashboardMetrics';
import { useStore } from '@/lib/store';
import { calcMetrics, normalizeMetrics } from '@/app/lib/metrics';
import type { Position } from '@/lib/services/dataService';
import type { DailyResult } from '@/app/lib/types';

const buildMetrics = (() => {
  const evalDate = '2024-01-03';
  const prevDate = '2024-01-02';
  const positions: Position[] = [
    {
      symbol: 'MISS',
      qty: 10,
      avgPrice: 100,
      last: 95,
      prevClose: 100,
      priceOk: true,
    } as Position,
  ];
  const dailyResults: DailyResult[] = [
    { date: '2024-01-01', realized: 0, unrealized: 0 },
    { date: prevDate, realized: 10, unrealized: 5 },
    { date: evalDate, realized: -5, unrealized: -3 },
  ];

  return (options: { inWindow: boolean; officialCloseMap: Record<string, Record<string, number>> }) => {
    const spy = jest
      .spyOn(require('@/app/lib/marketHours'), 'evaluateCloseWindow')
      .mockImplementation((date: string) => ({
        date,
        isTradingDay: true,
        requireOfficialClose: true,
        graceMinutes: 0,
        windowEndTs: Date.now(),
        nowTs: Date.now(),
        inWindow: options.inWindow,
      }));
    const normalized = normalizeMetrics(
      calcMetrics([], positions as any, dailyResults, {
        tradingDateStr: evalDate,
        periodEvalYmd: evalDate,
        officialCloseMap: options.officialCloseMap,
      }),
    );
    spy.mockRestore();
    return normalized;
  };
})();

describe('Dashboard period cards reflect official close degradation', () => {
  const queryClient = new QueryClient();
  const renderDashboard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardMetrics enrichedTrades={[]} positions={[]} />
      </QueryClientProvider>,
    );

  beforeEach(() => {
    (globalThis as typeof globalThis & { fetch?: jest.Mock }).fetch = jest
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({}) });
  });

  afterEach(() => {
    act(() => {
      useStore.setState({ metrics: null, periodHealth: null });
    });
  });

  it('shows degrade tooltip with official close impact when yellow alerts exist', async () => {
    const metrics = buildMetrics({ inWindow: false, officialCloseMap: {} });
    await act(async () => {
      useStore.setState({ metrics: metrics as any, periodHealth: null });
    });

    renderDashboard();

    const badge = await screen.findByTestId('period-degrade-hint-m11');
    expect(badge).toHaveTextContent('官方收盘价缺失');
    const tooltipButton = within(badge).getByRole('button');
    expect(tooltipButton.title).toContain('官方收盘价缺口：');
    expect(tooltipButton.title).toContain('2024-01-02');
    expect(tooltipButton.title).toContain('MISS');
    expect(tooltipButton.title).toContain('M6过夜=0→影响M4');
    expect(tooltipButton.title).toContain('WTD/MTD/YTD端点浮盈可能失真');
  });

  it('keeps cards healthy but annotates titles when only blue alerts remain', async () => {
    const metrics = buildMetrics({ inWindow: true, officialCloseMap: {} });
    await act(async () => {
      useStore.setState({ metrics: metrics as any, periodHealth: null });
    });

    renderDashboard();

    expect(screen.queryByTestId('period-degrade-hint-m11')).toBeNull();
    const pendingTitle = screen.getByTestId('period-pending-tooltip-m11');
    expect(pendingTitle).toHaveAttribute('title', expect.stringContaining('等待当日官方收盘价落地'));
    expect(pendingTitle.getAttribute('title')).toContain('MISS');
  });
});
