import {
  clearAndImportData,
  getAnyTradeCount,
  hashPayload,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_BUILTIN,
  DATASET_SOURCE_CUSTOM,
  DATASET_HASH_KEY,
  getDatasetSourceMeta,
  markDatasetAsCustom,
  doesDatabaseMatchDataset,
} from "@/lib/services/dataService";
import { BUILTIN_DATASET } from "@/data/builtin";

/**
 * Run once on app boot.
 * Rules:
 *  - First run: no source && empty DB -> seed builtin, set source=builtin & hash
 *  - source === custom -> NEVER touch IndexedDB (skip seeding)
 *  - source === builtin -> compare hash; only reseed when changed
 *  - Compat: also honor legacy keys datasetSource/datasetHash
 */
export async function ensureBuiltInDatasetLoaded() {
  // Primary keys
  const source = localStorage.getItem(DATASET_SOURCE_KEY);
  const storedHash = localStorage.getItem(DATASET_HASH_KEY);

  // Legacy compat keys (older builds)
  const legacySource = localStorage.getItem("datasetSource");
  const legacyHash = localStorage.getItem("datasetHash");

  const metaSource = await getDatasetSourceMeta();

  const markers = [source, legacySource, metaSource];
  const effectiveSource = (markers.includes(DATASET_SOURCE_CUSTOM)
    ? DATASET_SOURCE_CUSTOM
    : markers.includes(DATASET_SOURCE_BUILTIN)
      ? DATASET_SOURCE_BUILTIN
      : null) as typeof DATASET_SOURCE_BUILTIN | typeof DATASET_SOURCE_CUSTOM | null;
  
  const effectiveHash = storedHash ?? legacyHash ?? null;

  // 1) Custom data: never overwrite
  if (effectiveSource === DATASET_SOURCE_CUSTOM) {
    if (source !== DATASET_SOURCE_CUSTOM) {
      await markDatasetAsCustom();
    }
    console.info("[dataset] custom source detected -> skip builtin seeding");
    return;
  }

  // 2) First run: no mark + empty store -> seed builtin
  const hasAny = await getAnyTradeCount().catch(() => 0);
  if (!effectiveSource && !hasAny) {
    await clearAndImportData(BUILTIN_DATASET);
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    localStorage.setItem(DATASET_HASH_KEY, hashPayload(BUILTIN_DATASET));
    return;
  }

  if (!effectiveSource && hasAny) {
    await markDatasetAsCustom();
    return;
  }

  // 3) Builtin: only refresh when hash changed
  if (effectiveSource === DATASET_SOURCE_BUILTIN) {
    const expected = hashPayload(BUILTIN_DATASET);
    if (effectiveHash !== expected) {
      const matches = await doesDatabaseMatchDataset(BUILTIN_DATASET, { strict: true });
      if (matches) {
        try {
          localStorage.setItem(DATASET_HASH_KEY, expected);
          localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
        } catch {
          /* ignore storage errors */
        }
        if (!source) {
          // ensure marker exists even if only legacy key was present
          localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
        }
        return;
      }

      await markDatasetAsCustom();
      return;
    }
    // Normalize: if只有旧key被设置，把新key也补上
    if (!source) {
      localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    }
  }
}
