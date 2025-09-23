"use client";

import { useEffect, useState } from "react";
import {
  importData,
  findTrades,
  computeDataHash,
  DATASET_HASH_KEY,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_BUILTIN,
  resolveDatasetSource,
} from "@/lib/services/dataService";
import { loadJson } from "@/app/lib/dataSource";
import type { Position } from "@/lib/services/dataService";
import { computeFifo, type EnrichedTrade } from "@/lib/fifo";
import { PositionsTable } from "@/modules/PositionsTable";

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        const tradesFile = await loadJson("trades");
        const initPositionsFile = await loadJson("initial_positions");
        const rawData = { trades: tradesFile, positions: initPositionsFile };

        const builtinHash = await computeDataHash(rawData);

        let storedHash: string | null = null;
        let storedSource: string | null = null;
        try {
          storedHash = localStorage.getItem(DATASET_HASH_KEY);
          storedSource = localStorage.getItem(DATASET_SOURCE_KEY);
        } catch {
          /* ignore */
        }

        const datasetSource = resolveDatasetSource(
          builtinHash,
          storedHash,
          storedSource,
        );

        let allTrades = await findTrades();

        const shouldSeedBuiltin =
          datasetSource === DATASET_SOURCE_BUILTIN && allTrades.length === 0;
        const shouldRefreshBuiltin =
          datasetSource === DATASET_SOURCE_BUILTIN && storedHash !== builtinHash;

        if (shouldSeedBuiltin || shouldRefreshBuiltin) {
          if (shouldSeedBuiltin && storedHash === builtinHash) {
            try {
              localStorage.removeItem(DATASET_HASH_KEY);
            } catch {
              /* ignore */
            }
          }

          await importData(rawData);
          storedHash = builtinHash;
          try {
            localStorage.setItem(DATASET_HASH_KEY, builtinHash);
          } catch {
            /* ignore */
          }
          allTrades = await findTrades();
        }

        const enriched = computeFifo(allTrades);
        setTrades(enriched);

        // 根据 enriched 计算最新持仓（quantityAfter / averageCost）
        const lastMap: Record<string, EnrichedTrade> = {};
        for (const t of enriched) {
          lastMap[t.symbol] = t; // 由于 computeFifo 已按日期升序，遍历结束时即为最后状态
        }

        const posList: Position[] = Object.values(lastMap).map((t) => ({
          symbol: t.symbol,
          qty: t.quantityAfter,
          avgPrice: t.averageCost,
          last: 0,
          priceOk: true,
          stale: true,
        }));

        setPositions(posList);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  if (isLoading) {
    return <div>Loading positions...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Current Positions
      </h1>
      <PositionsTable positions={positions} trades={trades} />
    </main>
  );
}
