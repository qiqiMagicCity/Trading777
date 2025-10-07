/** @jest-environment jsdom */

import 'fake-indexeddb/auto';

import {
  clearOfficialCloseOverlayStore,
  overlayEntriesToMap,
  putOfficialCloseOverlays,
  readOfficialCloseOverlay,
  removeOfficialCloseOverlay,
} from '@/app/lib/officialCloseOverlayStore';
import {
  createMissingOfficialCloseDiagnostics,
} from '@/app/lib/diagnostics/reportMissingOfficialClose';
import {
  requireOfficialClose,
  setOfficialCloseContext,
} from '@/app/lib/price/requireOfficialClose';

describe('official close overlay store integration', () => {
  beforeEach(async () => {
    await clearOfficialCloseOverlayStore();
    setOfficialCloseContext(null);
  });

  it('returns overlay price without emitting diagnostics', async () => {
    await putOfficialCloseOverlays([
      { symbol: 'AAPL', date: '2024-01-02', price: 182.63 },
    ]);
    const entries = await readOfficialCloseOverlay();
    const overlayMap = overlayEntriesToMap(entries);
    const diagnostics = createMissingOfficialCloseDiagnostics();

    const release = setOfficialCloseContext({
      map: {},
      overlayMap,
      diagnostics,
    });

    const result = requireOfficialClose('AAPL', '2024-01-02', 'M6');
    release();

    expect(result).toEqual({ ok: true, price: 182.63 });
    expect(diagnostics.missingOfficialCloses).toHaveLength(0);
    expect(diagnostics.pendingOfficialCloses).toHaveLength(0);
  });

  it('falls back to diagnostics after removing overlay entry', async () => {
    await putOfficialCloseOverlays([
      { symbol: 'TSLA', date: '2024-01-03', price: 248.2 },
    ]);
    await removeOfficialCloseOverlay({ symbol: 'TSLA', date: '2024-01-03' });

    const diagnostics = createMissingOfficialCloseDiagnostics();
    const release = setOfficialCloseContext({
      map: {},
      overlayMap: {},
      diagnostics,
      closeWindowEvaluator: () => false,
    });

    const result = requireOfficialClose('TSLA', '2024-01-03', 'M6');
    release();

    expect(result).toEqual({ ok: false, reason: 'no_official_close' });
    expect(diagnostics.missingOfficialCloses).toHaveLength(1);
    expect(diagnostics.pendingOfficialCloses).toHaveLength(0);
    expect(diagnostics.missingOfficialCloses[0]).toMatchObject({
      symbol: 'TSLA',
      date: '2024-01-03',
    });
  });

  it('prefers overlay price over file close map', async () => {
    await putOfficialCloseOverlays([
      { symbol: 'MSFT', date: '2024-01-05', price: 399.12 },
    ]);
    const entries = await readOfficialCloseOverlay();
    const overlayMap = overlayEntriesToMap(entries);
    const diagnostics = createMissingOfficialCloseDiagnostics();

    const release = setOfficialCloseContext({
      map: { MSFT: { '2024-01-05': 300 } },
      overlayMap,
      diagnostics,
    });

    const result = requireOfficialClose('MSFT', '2024-01-05', 'M6');
    release();

    expect(result).toEqual({ ok: true, price: 399.12 });
    expect(diagnostics.missingOfficialCloses).toHaveLength(0);
    expect(diagnostics.pendingOfficialCloses).toHaveLength(0);
  });
});
