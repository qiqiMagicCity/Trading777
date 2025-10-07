/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { OfficialCloseGovernancePanel } from '../OfficialCloseGovernancePanel';
import type { MetricsContract } from '@/app/lib/types/metrics';
import { setCorporateActions, clearCorporateActions } from '@/app/lib/officialCloseAdjustments';

describe('official close governance panel adjustment column', () => {
  beforeEach(() => {
    clearCorporateActions();
    setCorporateActions([
      { symbol: 'AAPL', date: '2024-01-02', type: 'split', factor: 0.5 },
    ]);
  });

  it('reveals adjFactor column and exports adjusted value', async () => {
    const metrics: MetricsContract = {
      M1: 0,
      M2: 0,
      M3: 0,
      M4: 0,
      M5: { behavior: 0, fifo: 0 },
      M6: { total: 0 },
      diagnostics: {
        missingOfficialCloses: [
          {
            symbol: 'AAPL',
            date: '2024-01-01',
            purposes: ['M6'],
            impact: ['M6过夜桶=0'],
            hasFallback: false,
          },
        ],
        pendingOfficialCloses: [],
      },
      _period: {
        degraded: { wtd: false, mtd: false, ytd: false },
        diagnostics: {
          wtd: { degraded: false, status: 'ok', official: { missing: [], pending: [] }, periodEvalYmd: '2024-01-02' },
        },
      },
    } as MetricsContract;

    render(<OfficialCloseGovernancePanel metrics={metrics} />);
    await screen.findByTestId('overlay-table');

    fireEvent.click(screen.getByTestId('toggle-adj-factor'));

    const table = screen.getByTestId('governance-table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    const adjCell = within(rows[1]!).getByText('0.5000');
    expect(adjCell).toBeInTheDocument();
  });
});
