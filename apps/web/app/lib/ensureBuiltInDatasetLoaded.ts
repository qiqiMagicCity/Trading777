import {
  clearAndImportData,
  getAnyTradeCount,
  hashPayload,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_BUILTIN,
  DATASET_SOURCE_CUSTOM,
  DATASET_HASH_KEY,
  getDatasetSourceMeta,
  getDatasetHashMeta,
  markDatasetAsCustom,
  markDatasetAsBuiltin,
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
  const metaHash = await getDatasetHashMeta();

  const markers = [source, legacySource, metaSource];
  const effectiveSource = (markers.includes(DATASET_SOURCE_CUSTOM)
    ? DATASET_SOURCE_CUSTOM
    : markers.includes(DATASET_SOURCE_BUILTIN)
      ? DATASET_SOURCE_BUILTIN
      : null) as typeof DATASET_SOURCE_BUILTIN | typeof DATASET_SOURCE_CUSTOM | null;

  const effectiveHash = storedHash ?? legacyHash ?? metaHash ?? null;

  let hasAny = 0;
  try {
    hasAny = await getAnyTradeCount();
  } catch {
    hasAny = 0;
  }

  const expectedHash = hashPayload(BUILTIN_DATASET);

  // 1) Custom data: never overwrite
  if (effectiveSource === DATASET_SOURCE_CUSTOM) {
    if (source !== DATASET_SOURCE_CUSTOM) {
      await markDatasetAsCustom();
    }
    console.info("[dataset] custom source detected -> skip builtin seeding");
    return;
  }

  // 2) First run: no mark + empty store -> seed builtin
  if (!effectiveSource && !hasAny) {
    await clearAndImportData(BUILTIN_DATASET);
    await markDatasetAsBuiltin(expectedHash);
    return;
  }

  if (!effectiveSource && hasAny) {
    await markDatasetAsCustom();
    return;
  }

  // 3) Builtin: only refresh when hash changed
  if (effectiveSource === DATASET_SOURCE_BUILTIN) {
    const matches = hasAny
      ? await doesDatabaseMatchDataset(BUILTIN_DATASET, { strict: true }).catch(() => false)
      : false;

    if (!matches) {
      if (!hasAny) {
        await clearAndImportData(BUILTIN_DATASET);
        await markDatasetAsBuiltin(expectedHash);
      } else {
        await markDatasetAsCustom();
      }
      return;
    }

    if (
      effectiveHash !== expectedHash ||
      source !== DATASET_SOURCE_BUILTIN ||
      legacySource !== DATASET_SOURCE_BUILTIN ||
      metaSource !== DATASET_SOURCE_BUILTIN ||
      storedHash !== expectedHash ||
      legacyHash !== expectedHash ||
      metaHash !== expectedHash
    ) {
      await markDatasetAsBuiltin(expectedHash);
    }
  }
}
