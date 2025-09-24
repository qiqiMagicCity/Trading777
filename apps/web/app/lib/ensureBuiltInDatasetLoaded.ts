import {
  clearAndImportData,
  getAnyTradeCount,
  hashPayload,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_BUILTIN,
  DATASET_SOURCE_CUSTOM,
  DATASET_HASH_KEY,
} from "@/lib/services/dataService";
import { BUILTIN_DATASET } from "@/data/builtin";

/**
 * Run once on app boot.
 * Rules:
 * - If no source AND no data => seed builtin, set source=builtin & hash.
 * - If source === "custom" => never touch IndexedDB.
 * - If source === "builtin" => compare hash; only re-seed when changed.
 */
export async function ensureBuiltInDatasetLoaded() {
  const source = localStorage.getItem(DATASET_SOURCE_KEY);
  const hasAny = await getAnyTradeCount().catch(() => 0);

  // First run: no mark + empty DB -> seed builtin
  if (!source && !hasAny) {
    await clearAndImportData(BUILTIN_DATASET);
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    localStorage.setItem(DATASET_HASH_KEY, hashPayload(BUILTIN_DATASET));
    return;
  }

  if (source === DATASET_SOURCE_CUSTOM) return;

  if (source === DATASET_SOURCE_BUILTIN) {
    const current = localStorage.getItem(DATASET_HASH_KEY);
    const expected = hashPayload(BUILTIN_DATASET);
    if (current !== expected) {
      await clearAndImportData(BUILTIN_DATASET);
      localStorage.setItem(DATASET_HASH_KEY, expected);
    }
  }
}
