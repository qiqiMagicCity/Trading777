import trades from "@/../public/trades.json";
import positions from "@/../public/initial_positions.json";

export const BUILTIN_DATASET = {
  trades,
  positions,
} as const;
