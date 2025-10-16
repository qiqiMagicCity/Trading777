import { replayPortfolio } from "@/app/lib/tradeReplay";
import type { Trade } from "@/app/lib/services/dataService";
import { findTrades } from "@/app/lib/services/dataService";

function normalizeSymbol(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function isOnOrBefore(date: string, pivot: string): boolean {
  return date <= pivot;
}

export async function getRelatedSymbols(evaluationDay: string): Promise<string[]> {
  const trades = await findTrades();
  const filtered: Trade[] = trades.filter(
    (trade): trade is Trade => typeof trade?.date === "string" && trade.date.length > 0,
  );

  const uptoDay = filtered.filter((trade) => isOnOrBefore(trade.date, evaluationDay));
  const dayTrades = uptoDay.filter((trade) => trade.date === evaluationDay);
  const { positions } = replayPortfolio(uptoDay);

  const symbols = new Set<string>();

  for (const position of positions) {
    const symbol = normalizeSymbol(position?.symbol);
    if (!symbol) continue;
    if (typeof position.qty !== "number") continue;
    if (position.qty === 0) continue;
    symbols.add(symbol);
  }

  for (const trade of dayTrades) {
    const symbol = normalizeSymbol(trade.symbol);
    if (!symbol) continue;
    symbols.add(symbol);
  }

  return Array.from(symbols).sort();
}
