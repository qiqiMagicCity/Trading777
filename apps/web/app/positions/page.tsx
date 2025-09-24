"use client";

import { useEffect, useState } from "react";
import { findTrades } from "@/lib/services/dataService";
import type { Position } from "@/lib/services/dataService";
import { computeFifo, type EnrichedTrade } from "@/lib/fifo";
import { PositionsTable } from "@/modules/PositionsTable";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        // Single guard call; never fetch('/trades.json') here
        await ensureBuiltInDatasetLoaded();

        const allTrades = await findTrades();
        const enriched = computeFifo(allTrades);
        setTrades(enriched);

        // build latest positions from enriched trades
        const lastMap: Record<string, EnrichedTrade> = {};
        for (const t of enriched) lastMap[t.symbol] = t;

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

  if (isLoading) return <div>Loading positions...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Current Positions</h1>
      <PositionsTable positions={positions} trades={trades} />
    </main>
  );
}
