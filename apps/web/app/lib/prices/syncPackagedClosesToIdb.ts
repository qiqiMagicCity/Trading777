export interface SyncPackagedClosesStats {
  total: number;
  inserted: number;
  skipped: {
    total: number;
    higherPriority: number;
    same: number;
  };
}

function createEmptyStats(): SyncPackagedClosesStats {
  return {
    total: 0,
    inserted: 0,
    skipped: { total: 0, higherPriority: 0, same: 0 },
  };
}

let lastSyncStats: SyncPackagedClosesStats = createEmptyStats();

export function getLastPackagedSyncStats(): SyncPackagedClosesStats {
  return {
    total: lastSyncStats.total,
    inserted: lastSyncStats.inserted,
    skipped: { ...lastSyncStats.skipped },
  };
}

export function shouldSyncPackagedToIdb(): boolean {
  return false;
}

export async function syncPackagedClosesToIdb(): Promise<SyncPackagedClosesStats> {
  lastSyncStats = createEmptyStats();
  return lastSyncStats;
}
