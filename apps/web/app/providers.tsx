'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { importData, findTrades, DATASET_HASH_KEY } from './lib/services/dataService';
import { loadJson } from '@/app/lib/dataSource';
import { lsGet } from './lib/env';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const [dataReady, setDataReady] = React.useState(false);
  const [datasetHash, setDatasetHash] = React.useState<string | null>(null);

  // Ensure initial demo data is loaded into IndexedDB so every page sees the same dataset
  React.useEffect(() => {
    setDatasetHash(lsGet(DATASET_HASH_KEY));
    async function initData() {
      try {
        const storedHash = lsGet(DATASET_HASH_KEY);
        const trades = await findTrades();
        if (!storedHash && trades.length === 0) {
          const tradesFile = await loadJson('trades');
          const initPositionsFile = await loadJson('initial_positions');
          await importData({ trades: tradesFile, positions: initPositionsFile });
        }
      } catch (_) {
        // optional: ignore errors when demo file missing
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
