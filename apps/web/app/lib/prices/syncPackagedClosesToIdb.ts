function readFreezeFlag(): string | null {
  const envFreeze =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_FREEZE_DATE || process.env.FREEZE_DATE)) ||
    "";
  if (typeof envFreeze === "string" && envFreeze.trim()) {
    return envFreeze.trim();
  }
  if (typeof window !== "undefined") {
    const win = window as typeof window & { NEXT_PUBLIC_FREEZE_DATE?: string };
    const value = win.NEXT_PUBLIC_FREEZE_DATE;
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function shouldSyncPackagedToIdb(): boolean {
  const freeze = readFreezeFlag();
  if (freeze) {
    console.warn(
      `[syncPackagedClosesToIdb] freeze flag ${freeze} ignored: packaged official closes are disabled`,
    );
  }
  return false;
}

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

export async function syncPackagedClosesToIdb(): Promise<SyncPackagedClosesStats> {
  if (readFreezeFlag()) {
    console.warn("[syncPackagedClosesToIdb] packaged sync disabled by README rules");
  }
  lastSyncStats = createEmptyStats();
  return lastSyncStats;
}
