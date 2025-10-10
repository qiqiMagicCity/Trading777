import type { ClosePriceMap } from '@/app/lib/dailyResults';
import type { MissingOfficialCloseEntry } from '@/app/lib/types/metrics';
import {
  createMissingOfficialCloseDiagnostics,
  type MissingOfficialClosePurpose,
} from '@/app/lib/diagnostics/reportMissingOfficialClose';
import { requireOfficialClose, setOfficialCloseContext } from '@/app/lib/price/requireOfficialClose';

interface OfficialCloseContextMaps {
  official: ClosePriceMap;
  overlay: ClosePriceMap;
  packaged: ClosePriceMap;
  idb: ClosePriceMap;
}

export function filterMissingOfficialEntries(
  entries: MissingOfficialCloseEntry[],
  maps: OfficialCloseContextMaps,
): MissingOfficialCloseEntry[] {
  if (!entries.length) return [];
  const release = setOfficialCloseContext({
    map: maps.official,
    overlayMap: maps.overlay,
    packagedMap: maps.packaged,
    idbMap: maps.idb,
    diagnostics: createMissingOfficialCloseDiagnostics(),
  });
  try {
    return entries.filter((entry) => {
      const purposes = Array.isArray(entry?.purposes) ? entry.purposes : [];
      const purpose = (purposes[0] ?? 'runAll') as MissingOfficialClosePurpose;
      const verdict = requireOfficialClose(entry.symbol, entry.date, purpose);
      return !verdict.ok;
    });
  } finally {
    release();
  }
}
