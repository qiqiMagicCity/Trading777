'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DATASET_HASH_KEY } from './lib/services/dataService';
import { lsGet } from './lib/env';
import { ensureDatasetReady } from '@/app/lib/dataset';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const [dataReady, setDataReady] = React.useState(false);
  const [datasetHash, setDatasetHash] = React.useState<string | null>(null);

  // Ensure initial demo data is loaded into IndexedDB so every page sees the same dataset
  React.useEffect(() => {
    setDatasetHash(lsGet(DATASET_HASH_KEY));
    async function initData() {
      try {
        const status = await ensureDatasetReady();
        console.log('[dataset] ready:', status);
        setDatasetHash(lsGet(DATASET_HASH_KEY));
      } catch (err) {
        console.error('Dataset bootstrap failed:', err);
      } finally {
        setDataReady(true);
      }
    }
    initData();
  }, []);

  if (!dataReady) {
    return <div className="text-center p-10">数据加载中...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
