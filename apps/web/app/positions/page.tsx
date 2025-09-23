"use client";

import { useEffect, useState } from "react";
import {
  importData,
  findTrades,
  computeDataHash,
  DATASET_HASH_KEY,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
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

        // 先查询是否已有交易数据，若没有则导入示例数据（仅当未导入自定义数据时）
        let allTrades = await findTrades();
        if (allTrades.length === 0) {
          const tradesFile = await loadJson("trades");
          const initPositionsFile = await loadJson("initial_positions");
          const rawData = { trades: tradesFile, positions: initPositionsFile };

          let storedHash: string | null = null;
          let datasetSource: string | null = null;
          try {
            storedHash = localStorage.getItem(DATASET_HASH_KEY);
            datasetSource = localStorage.getItem(DATASET_SOURCE_KEY);
          } catch {
            /* ignore */
          }

          const builtinHash = await computeDataHash(rawData);
          datasetSource = resolveDatasetSource(
            builtinHash,
            storedHash,
            datasetSource,
          );
          const hasCustomHash =
            storedHash !== null && storedHash !== builtinHash;
          const isCustomDataset =
            datasetSource === DATASET_SOURCE_CUSTOM || hasCustomHash;

          if (!isCustomDataset) {
            await importData(rawData);
            allTrades = await findTrades();
          }
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
