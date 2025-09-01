import type { InitialPosition, EnrichedTrade } from "./fifo";
import type { RawTrade, ClosePriceMap } from "./runAll";
import { assertM6Equality } from "./invariants";
import fs from "node:fs"; import path from "node:path";

/**
 * Ensure closing trades never exceed available lots.
 * For a sell the remaining quantity must stay >= 0,
 * for a cover it must stay <= 0.
 */
export function assertNoOverClose(trades: EnrichedTrade[]) {
  for (const t of trades) {
    if (t.action === "sell" && t.quantityAfter < 0) {
      throw new Error(
        `over close: ${t.symbol} sell batch ${t.tradeCount} qty ${t.quantity} at ${t.date}`
      );
    }
    if (t.action === "cover" && t.quantityAfter > 0) {
      throw new Error(
        `over cover: ${t.symbol} cover batch ${t.tradeCount} qty ${t.quantity} at ${t.date}`
      );
    }
  }
}

/**
 * For each trade, recompute the running position and ensure it matches
 * FIFO's quantityAfter output. This guards against lot creation or loss.
 */
export function assertLotConservation(
  initial: InitialPosition[],
  trades: EnrichedTrade[]
) {
  const pos = new Map<string, number>();
  for (const p of initial) pos.set(p.symbol, (pos.get(p.symbol) || 0) + p.qty);

  for (const t of trades) {
    const qty = Math.abs(t.quantity);
    const prev = pos.get(t.symbol) || 0;
    let next = prev;
    switch (t.action) {
      case "buy":
        next = prev + qty;
        break;
      case "sell":
        next = prev - qty;
        break;
      case "short":
        next = prev - qty;
        break;
      case "cover":
        next = prev + qty;
        break;
    }
    if (Math.abs(next - t.quantityAfter) > 1e-6) {
      throw new Error(
        `lot conservation: ${t.symbol} ${t.action} batch ${t.tradeCount} qty ${t.quantity} at ${t.date}`
      );
    }
    pos.set(t.symbol, next);
  }
}

/**
 * Disallow negative running positions – short positions are not expected.
 */
export function assertNoNegativeLots(trades: EnrichedTrade[]) {
  for (const t of trades) {
    if (t.quantityAfter < 0) {
      throw new Error(
        `negative lot: ${t.symbol} ${t.action} batch ${t.tradeCount} qty ${t.quantity} at ${t.date}`
      );
    }
  }
}

// Utility to dump artifacts for replay/debugging
export function snapshotArtifacts(
  input: {
    initialPositions: InitialPosition[];
    rawTrades: RawTrade[];
    closePrices: ClosePriceMap;
    dailyResults: { date: string; realized: number; unrealized: number }[];
  },
  output: unknown
) {
  const inDir = path.resolve(process.cwd(), ".artifacts/inputs");
  const outDir = path.resolve(process.cwd(), ".artifacts/outputs");
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(inDir, "trades.json"),
    JSON.stringify(input.rawTrades, null, 2)
  );
  fs.writeFileSync(
    path.join(inDir, "initial_positions.json"),
    JSON.stringify(input.initialPositions, null, 2)
  );
  fs.writeFileSync(
    path.join(inDir, "close_prices.json"),
    JSON.stringify(input.closePrices, null, 2)
  );
  fs.writeFileSync(
    path.join(inDir, "dailyResults.json"),
    JSON.stringify(input.dailyResults, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "runAll.json"),
    JSON.stringify(output, null, 2)
  );
}
export { assertM6Equality };
