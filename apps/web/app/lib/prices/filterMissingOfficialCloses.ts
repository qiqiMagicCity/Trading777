import type { ClosePriceMap } from '@/app/lib/dailyResults';
import type { MissingOfficialCloseEntry } from '@/app/lib/types/metrics';
import {
  createMissingOfficialCloseDiagnostics,
  type MissingOfficialClosePurpose,
} from '@/app/lib/diagnostics/reportMissingOfficialClose';
import {
  requireOfficialClose as baseRequireOfficialClose,
  setOfficialCloseContext,
} from '@/app/lib/price/requireOfficialClose';
import {
  getLatestOfficialCloseMaps,
  getLatestMissingOfficialEntries,
} from '@/app/lib/prices/officialCloseCache';
import { useStore } from '@/app/lib/store';

interface OfficialCloseContextMaps {
  official: ClosePriceMap;
  overlay: ClosePriceMap;
  idb: ClosePriceMap;
}

export function filterMissingOfficialEntries(
  entries: MissingOfficialCloseEntry[],
  maps: OfficialCloseContextMaps,
  requireFn: typeof baseRequireOfficialClose = baseRequireOfficialClose,
): MissingOfficialCloseEntry[] {
  if (!entries.length) return [];
  const release = setOfficialCloseContext({
    map: maps.official,
    overlayMap: maps.overlay,
    idbMap: maps.idb,
    diagnostics: createMissingOfficialCloseDiagnostics(),
  });
  try {
    return entries.filter((entry) => {
      const purposes = Array.isArray(entry?.purposes) ? entry.purposes : [];
      const purpose = (purposes[0] ?? 'runAll') as MissingOfficialClosePurpose;
      const verdict = requireFn(entry.symbol, entry.date, purpose);
      return !verdict.ok;
    });
  } finally {
    release();
  }
}

export async function filterMissingOfficialCloses({
  requireOfficialClose,
}: {
  requireOfficialClose: typeof baseRequireOfficialClose;
}): Promise<MissingOfficialCloseEntry[]> {
  const maps = getLatestOfficialCloseMaps();
  const store = useStore.getState();
  const entries =
    getLatestMissingOfficialEntries() ??
    store.metrics?.diagnostics?.missingOfficialCloses ??
    [];
  if (!maps) {
    return entries.slice();
  }
  return filterMissingOfficialEntries(entries, maps, requireOfficialClose);
}
