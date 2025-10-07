/** @jest-environment jsdom */

import 'fake-indexeddb/auto';

import { setCorporateActions, clearCorporateActions } from '@/app/lib/officialCloseAdjustments';
import {
  createMissingOfficialCloseDiagnostics,
} from '@/app/lib/diagnostics/reportMissingOfficialClose';
import {
  requireOfficialClose,
  setOfficialCloseContext,
} from '@/app/lib/price/requireOfficialClose';
import { calcMetrics } from '@/app/lib/metrics';
import type { Position } from '@/app/lib/services/dataService';

const emptyDailyResults: any[] = [];

describe('official close adjustments for splits', () => {
  beforeEach(() => {
    clearCorporateActions();
    setOfficialCloseContext(null);
  });

  it('adjusts previous close across forward splits', () => {
    setCorporateActions([
      { symbol: 'AAPL', date: '2024-01-02', type: 'split', factor: 0.5 },
    ]);

    const diagnostics = createMissingOfficialCloseDiagnostics();
    const release = setOfficialCloseContext({
      map: { AAPL: { '2024-01-01': 100 } },
      diagnostics,
      resolveTargetDate: () => '2024-01-02',
    });

    const result = requireOfficialClose('AAPL', '2024-01-01', 'M6');
    release();

    expect(result).toEqual({ ok: true, price: 50 });
  });

  it('propagates adjusted prev close into M6 overnight bucket', () => {
    setCorporateActions([
      { symbol: 'AAPL', date: '2024-01-02', type: 'split', factor: 0.5 },
    ]);

    const positions: Position[] = [
      {
        symbol: 'AAPL',
        qty: 1,
        avgPrice: 40,
        last: 52,
        priceOk: true,
      },
    ];

    const metrics = calcMetrics([], positions, emptyDailyResults as any, {
      tradingDateStr: '2024-01-02',
      periodEvalYmd: '2024-01-02',
      officialCloseMap: { AAPL: { '2024-01-01': 100, '2024-01-02': 52 } },
    });

    expect(metrics._m6?.mtmOvernight).toBeCloseTo(2, 6);
    expect(metrics.diagnostics?.missingOfficialCloses ?? []).toHaveLength(0);
  });
});
