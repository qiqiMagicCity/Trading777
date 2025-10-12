import type { ClosePriceMap } from '@/app/lib/dailyResults';
import type { MissingOfficialCloseEntry } from '@/app/lib/types/metrics';

interface OfficialCloseCache {
  official: ClosePriceMap;
  overlay: ClosePriceMap;
  /**
   * @deprecated debug-only; must NOT be used in business logic
   */
  packaged?: ClosePriceMap;
  idb: ClosePriceMap;
}

let latest: OfficialCloseCache | null = null;
let latestMissing: MissingOfficialCloseEntry[] | null = null;

export function setLatestOfficialCloseMaps(cache: OfficialCloseCache | null): void {
  latest = cache;
}

export function getLatestOfficialCloseMaps(): OfficialCloseCache | null {
  return latest;
}

export function setLatestMissingOfficialEntries(
  entries: MissingOfficialCloseEntry[] | null,
): void {
  latestMissing = entries ? entries.slice() : null;
}

export function getLatestMissingOfficialEntries(): MissingOfficialCloseEntry[] | null {
  return latestMissing ? latestMissing.slice() : null;
}
