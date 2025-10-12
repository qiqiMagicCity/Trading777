/** @jest-environment jsdom */

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

import { OfficialCloseGovernancePanel } from '../OfficialCloseGovernancePanel';
import type { MetricsContract } from '@/app/lib/types/metrics';

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
      },
    ],
    pendingOfficialCloses: [],
  },
  _period: { degraded: { wtd: false, mtd: false, ytd: false } },
} as MetricsContract;

function PanelWrapper() {
  const [metrics, setMetrics] = useState(baseMetrics);
  return (
    <OfficialCloseGovernancePanel
      metrics={metrics}
      onOverlayChange={() =>
        setMetrics({
          ...metrics,
          diagnostics: { missingOfficialCloses: [], pendingOfficialCloses: [] },
        })
      }
    />
  );
}

describe('official close governance panel import flow', () => {
  it('imports overlay entries and refreshes diagnostics', async () => {
    render(<PanelWrapper />);

    fireEvent.click(screen.getByTestId('governance-go-import'));
    await screen.findByTestId('overlay-import-confirm');

    fireEvent.change(screen.getByTestId('overlay-import-symbol'), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByTestId('overlay-import-price'), { target: { value: '182.63' } });
    fireEvent.change(screen.getByTestId('overlay-import-date'), { target: { value: '2024-01-02' } });
    fireEvent.click(screen.getByTestId('overlay-import-manual-add'));

    fireEvent.click(screen.getByTestId('overlay-import-confirm'));

    await waitFor(() => {
      const table = screen.getByTestId('governance-table');
      expect(within(table).queryByText('AAPL')).not.toBeInTheDocument();
    });

    const overlayTable = screen.getByTestId('overlay-table');
    const rows = within(overlayTable).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText('AAPL')).toBeInTheDocument();
  });
});
