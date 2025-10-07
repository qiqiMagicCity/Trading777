/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { OfficialCloseGovernancePanel } from '../OfficialCloseGovernancePanel';
import type { MetricsContract } from '@/app/lib/types/metrics';
import { MissingOfficialCloseAlert } from '@/app/page';
import { summarizeMissingOfficialCloses } from '@/app/lib/missingOfficialClose';

describe('official close governance panel', () => {
  const baseMetrics: MetricsContract = {
    M1: 0,
    M2: 0,
    M3: 0,
    M4: 0,
    M5: { behavior: 0, fifo: 0 },
    M6: { total: 0 },
    M7: { B: 0, S: 0, P: 0, C: 0, total: 0 },
    M8: { B: 0, S: 0, P: 0, C: 0, total: 0 },
    M9: 0,
    M10: { win: 0, loss: 0, flat: 0, rate: 0 },
    diagnostics: {
      missingOfficialCloses: [
        {
          symbol: 'AAPL',
          date: '2024-01-02',
          purposes: ['M6'],
          impact: ['M6过夜桶=0', 'M4今日退化（过夜=0）'],
          hasFallback: true,
          firstDetectedAt: '2024-01-03T12:00:00Z',
          lastDetectedAt: '2024-01-03T12:30:00Z',
        },
      ],
      pendingOfficialCloses: [
        {
          symbol: 'MSFT',
          date: '2024-01-03',
          purposes: ['M6'],
          impact: ['M6过夜桶=0'],
          hasFallback: false,
          firstDetectedAt: '2024-01-03T21:00:00Z',
          lastDetectedAt: '2024-01-03T21:00:00Z',
        },
      ],
    },
    _period: { degraded: { wtd: false, mtd: false, ytd: false } },
  } as MetricsContract;

  it('filters by status and symbol selections', async () => {
    render(<OfficialCloseGovernancePanel metrics={baseMetrics} />);
    await screen.findByTestId('overlay-table');

    const table = screen.getByTestId('governance-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);

    fireEvent.change(screen.getByTestId('filter-status'), {
      target: { value: 'missing' },
    });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('黄条')).toBeInTheDocument();

    const symbolSelect = screen.getByTestId('filter-symbols') as HTMLSelectElement;
    Array.from(symbolSelect.options).forEach((option) => {
      option.selected = option.value === 'MSFT';
    });
    fireEvent.change(symbolSelect);
    expect(within(table).getByText('暂无符合条件的缺口。')).toBeInTheDocument();
  });

  it('exports CSV and toggles adjustment column with import dialog', async () => {
    const originalCreate = (URL as any).createObjectURL;
    const originalRevoke = (URL as any).revokeObjectURL;
    if (!originalCreate) {
      (URL as any).createObjectURL = () => 'blob:mock';
    }
    if (!originalRevoke) {
      (URL as any).revokeObjectURL = () => {};
    }
    const createObjectURL = jest
      .spyOn(URL, 'createObjectURL' as any)
      .mockReturnValue('blob:export');
    const revoke = jest
      .spyOn(URL, 'revokeObjectURL' as any)
      .mockImplementation(() => {});
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<OfficialCloseGovernancePanel metrics={baseMetrics} />);
    await screen.findByTestId('overlay-table');

    fireEvent.click(screen.getByTestId('governance-export'));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('toggle-adj-factor'));
    expect(screen.getAllByText('adjFactor')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('governance-go-import'));
    expect(screen.getByTestId('overlay-import-confirm')).toBeInTheDocument();

    createObjectURL.mockRestore();
    revoke.mockRestore();
    if (!originalCreate) {
      delete (URL as any).createObjectURL;
    }
    if (!originalRevoke) {
      delete (URL as any).revokeObjectURL;
    }
    click.mockRestore();
  });

  it('updates view after metrics change', async () => {
    const { rerender } = render(
      <OfficialCloseGovernancePanel metrics={baseMetrics} />,
    );
    await screen.findByTestId('overlay-table');
    const table = screen.getByTestId('governance-table');
    expect(within(table).getByText('AAPL')).toBeInTheDocument();

    const resolvedMetrics: MetricsContract = {
      ...baseMetrics,
      diagnostics: {
        missingOfficialCloses: [],
        pendingOfficialCloses: [],
      },
    } as MetricsContract;

    rerender(<OfficialCloseGovernancePanel metrics={resolvedMetrics} />);
    expect(screen.getByText('暂无符合条件的缺口。')).toBeInTheDocument();
  });
});

describe('missing-official-close alert link', () => {
  it('links to the governance panel with default filters', () => {
    const summaries = summarizeMissingOfficialCloses([
      {
        symbol: 'AAPL',
        date: '2024-01-02',
        purposes: ['M6'],
        impact: ['M6过夜桶=0'],
        hasFallback: true,
      },
    ]);
    render(<MissingOfficialCloseAlert summaries={summaries} />);
    const link = screen.getByTestId('missing-official-view-all');
    expect(link).toHaveAttribute('href', expect.stringContaining('status=missing'));
    expect(link.getAttribute('href')).toContain('impacts=' + encodeURIComponent('WTD/MTD/YTD端点浮盈可能失真'));
    expect(link.getAttribute('href')).toContain('symbols=AAPL');
  });
});
