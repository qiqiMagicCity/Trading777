import { ensureDatasetReady } from '@/app/lib/dataset';

/**
 * @deprecated 请改用 ensureDatasetReady。此别名保留以兼容旧引用。
 */
export async function ensureBuiltInDatasetLoaded() {
  return ensureDatasetReady();
}

export { ensureDatasetReady } from '@/app/lib/dataset';
export type { DatasetReadyStatus, SeedMode } from '@/app/lib/dataset';
