import { BUILTIN_DATASET } from '@/data/builtin';
import {
  clearAndImportData,
  getAnyPositionCount,
  getAnyTradeCount,
  hashPayload,
  markDatasetAsCustom,
  DATASET_HASH_KEY,
  DATASET_SOURCE_BUILTIN,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_KEY,
} from '@/lib/services/dataService';

const LEGACY_DATASET_SOURCE_KEY = 'datasetSource';
const LEGACY_DATASET_HASH_KEY = 'datasetHash';

export type SeedMode = 'demo' | 'off';
export type DatasetReadyStatus = 'idb' | 'seeded' | 'empty';

function setBuiltinMarkers(hash: string): void {
  try {
    localStorage.setItem(DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    localStorage.setItem(DATASET_HASH_KEY, hash);
    localStorage.setItem(LEGACY_DATASET_SOURCE_KEY, DATASET_SOURCE_BUILTIN);
    localStorage.setItem(LEGACY_DATASET_HASH_KEY, hash);
  } catch {
    /* ignore storage errors */
  }
}

function clearBuiltinMarkers(): void {
  try {
    localStorage.removeItem(DATASET_HASH_KEY);
    localStorage.removeItem(LEGACY_DATASET_HASH_KEY);
    if (localStorage.getItem(DATASET_SOURCE_KEY) !== DATASET_SOURCE_CUSTOM) {
      localStorage.removeItem(DATASET_SOURCE_KEY);
    }
    if (localStorage.getItem(LEGACY_DATASET_SOURCE_KEY) !== DATASET_SOURCE_CUSTOM) {
      localStorage.removeItem(LEGACY_DATASET_SOURCE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

export async function hasUserData(): Promise<boolean> {
  const [tradeCount, positionCount] = await Promise.all([
    getAnyTradeCount().catch(() => 0),
    getAnyPositionCount().catch(() => 0),
  ]);
  return Number(tradeCount) > 0 || Number(positionCount) > 0;
}

export async function ensureDatasetReady(): Promise<DatasetReadyStatus> {
  const mode = (process.env.NEXT_PUBLIC_SEED_MODE as SeedMode | undefined) ?? 'demo';

  const source = localStorage.getItem(DATASET_SOURCE_KEY);
  const storedHash = localStorage.getItem(DATASET_HASH_KEY);
  const legacySource = localStorage.getItem(LEGACY_DATASET_SOURCE_KEY);
  const legacyHash = localStorage.getItem(LEGACY_DATASET_HASH_KEY);

  const effectiveSource = (source ?? legacySource ?? null) as
    | typeof DATASET_SOURCE_BUILTIN
    | typeof DATASET_SOURCE_CUSTOM
    | null;
  const effectiveHash = storedHash ?? legacyHash ?? null;

  const hasData = await hasUserData();

  if (hasData) {
    if (effectiveSource === DATASET_SOURCE_CUSTOM) {
      if (source !== DATASET_SOURCE_CUSTOM) {
        markDatasetAsCustom();
      }
      return 'idb';
    }

    if (effectiveSource === DATASET_SOURCE_BUILTIN) {
      const expectedHash = hashPayload(BUILTIN_DATASET);
      if (effectiveHash !== expectedHash) {
        await clearAndImportData(BUILTIN_DATASET);
        setBuiltinMarkers(expectedHash);
        return 'seeded';
      }
      if (source !== DATASET_SOURCE_BUILTIN) {
        setBuiltinMarkers(effectiveHash ?? expectedHash);
      }
      return 'idb';
    }

    markDatasetAsCustom();
    return 'idb';
  }

  if (mode === 'off') {
    console.info('[dataset] seed mode OFF → skip built-in JSON');
    clearBuiltinMarkers();
    if (effectiveSource === DATASET_SOURCE_CUSTOM) {
      markDatasetAsCustom();
    }
    return 'empty';
  }

  if (effectiveSource === DATASET_SOURCE_CUSTOM) {
    markDatasetAsCustom();
    return 'empty';
  }

  await clearAndImportData(BUILTIN_DATASET);
  const hash = hashPayload(BUILTIN_DATASET);
  setBuiltinMarkers(hash);
  return 'seeded';
}
