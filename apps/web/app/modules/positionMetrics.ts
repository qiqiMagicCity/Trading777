import type { Position } from "@/lib/services/dataService";

export function getResolvedPrice(pos: Position, quotePrice: unknown): number {
  const fallbackPrice = Number.isFinite(pos.last) ? pos.last : pos.avgPrice;
  const candidatePrice =
    typeof quotePrice === "number" && Number.isFinite(quotePrice)
      ? quotePrice
      : fallbackPrice;

  return Number.isFinite(candidatePrice) ? (candidatePrice as number) : pos.avgPrice;
}

export function calculateIntradayValue(pos: Position, resolvedPrice: number): number {
  const prevClose = Number(pos.prevClose);
  const hasPrevClose = Number.isFinite(prevClose);
  const signedMarketValue = resolvedPrice * pos.qty;

  if (hasPrevClose) {
    return signedMarketValue - prevClose * pos.qty;
  }

  return (resolvedPrice - pos.avgPrice) * pos.qty;
}
