import tradesJson from "@/../public/trades.json";
import positionsJson from "@/../public/initial_positions.json";
import type { clearAndImportData, RawTrade, Position } from "@/lib/services/dataService";

type DatasetPayload = Parameters<typeof clearAndImportData>[0];

type TradesArray = NonNullable<DatasetPayload["trades"]>;
type PositionsArray = NonNullable<DatasetPayload["positions"]>;

const tradesData: TradesArray = Array.isArray(tradesJson)
  ? tradesJson.map((trade) => ({ ...(trade as RawTrade) }))
  : [];

const positionsData: PositionsArray = Array.isArray(positionsJson)
  ? positionsJson.map((position) => ({ ...(position as Partial<Position> & Record<string, unknown>) }))
  : [];

export const BUILTIN_DATASET: DatasetPayload = {
  trades: tradesData,
  positions: positionsData,
};
