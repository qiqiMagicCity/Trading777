import { loadJson } from "@/app/lib/dataSource";
import { compareOfficialSourcePriority } from "@/app/lib/prices/compareOfficialSourcePriority";
import { getPrice, putPrice } from "@/lib/services/dataService";

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
  return readFreezeFlag() !== null;
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

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function syncPackagedClosesToIdb(): Promise<SyncPackagedClosesStats> {
  if (!shouldSyncPackagedToIdb()) {
    lastSyncStats = createEmptyStats();
    return lastSyncStats;
  }
  try {
    const data = await loadJson("close_prices");
    if (!data || typeof data !== "object") {
      lastSyncStats = createEmptyStats();
      return lastSyncStats;
    }

    const tasks: Promise<void>[] = [];
    let skippedTotal = 0;
    let skippedHigherPriority = 0;
    let skippedSame = 0;
    let inserted = 0;
    let total = 0;
    for (const [rawSymbol, rawDates] of Object.entries(
      data as Record<string, Record<string, number>>,
    )) {
      if (!rawSymbol || typeof rawSymbol !== "string") continue;
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) continue;
      if (!rawDates || typeof rawDates !== "object") continue;

      for (const [rawDate, rawClose] of Object.entries(rawDates)) {
        if (!isValidDate(rawDate) || !isFiniteNumber(rawClose)) continue;
        total += 1;
        try {
          const existing = await getPrice(symbol, rawDate);
          if (existing) {
            const priority = compareOfficialSourcePriority(
              existing.source,
              "official/packaged",
            );
            if (priority < 0) {
              skippedHigherPriority += 1;
              skippedTotal += 1;
              continue;
            }
            if (priority === 0 && Number(existing.close) === rawClose) {
              skippedSame += 1;
              skippedTotal += 1;
              continue;
            }
          }
        } catch (error) {
          console.warn("[syncPackagedClosesToIdb] read existing price failed", error);
        }
        tasks.push(
          putPrice({
            symbol,
            date: rawDate,
            close: rawClose,
            source: "official/packaged",
          }).then(() => {
            inserted += 1;
          }),
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
    lastSyncStats = {
      total,
      inserted,
      skipped: {
        total: skippedTotal,
        higherPriority: skippedHigherPriority,
        same: skippedSame,
      },
    };
    return lastSyncStats;
  } catch (err) {
    console.warn("[syncPackagedClosesToIdb] failed", err);
    lastSyncStats = createEmptyStats();
    return lastSyncStats;
  }
}
