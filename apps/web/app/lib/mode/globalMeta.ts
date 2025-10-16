export type Mode = "close" | "live" | "degraded";
export type DegradedReason =
  | "live-latest-missing"
  | "close-official-missing"
  | null;

export interface GlobalMeta {
  mode: Mode;
  evaluationDay: string;
  latestPriceOk: boolean;
  officialCloseOk: boolean;
  degradedReason: DegradedReason;
  isComplete: boolean;
  missingPairs: Array<{ day: string; symbol: string }>;
}

export interface ComputeGlobalMetaArgs {
  nowNY: Date;
  evaluationDay: string;
  isTradingDay: boolean;
  beforeOfficialClose: boolean;
  relatedSymbols: string[];
  hasLivePriceFor(symbol: string): boolean;
  hasOfficialCloseFor(day: string, symbol: string): boolean;
}

export async function computeGlobalMeta({
  nowNY: _nowNY,
  evaluationDay,
  isTradingDay,
  beforeOfficialClose,
  relatedSymbols,
  hasLivePriceFor,
  hasOfficialCloseFor,
}: ComputeGlobalMetaArgs): Promise<GlobalMeta> {
  const uniqueSymbols = Array.from(new Set(relatedSymbols)).filter(
    (symbol) => typeof symbol === "string" && symbol.length > 0,
  );

  const missingPairs: Array<{ day: string; symbol: string }> = [];
  let mode: Mode;
  let degradedReason: DegradedReason = null;

  const allLiveAvailable = uniqueSymbols.every((symbol) =>
    hasLivePriceFor(symbol),
  );
  const allOfficialAvailable = uniqueSymbols.every((symbol) =>
    hasOfficialCloseFor(evaluationDay, symbol),
  );

  let latestPriceOk = allLiveAvailable;
  let officialCloseOk = allOfficialAvailable;

  if (isTradingDay && beforeOfficialClose) {
    if (allLiveAvailable) {
      mode = "live";
      degradedReason = null;
    } else {
      mode = "degraded";
      degradedReason = "live-latest-missing";
      latestPriceOk = false;
      for (const symbol of uniqueSymbols) {
        if (!hasLivePriceFor(symbol)) {
          missingPairs.push({ day: evaluationDay, symbol });
        }
      }
    }
  } else {
    if (allOfficialAvailable) {
      mode = "close";
      degradedReason = null;
    } else {
      mode = "degraded";
      degradedReason = "close-official-missing";
      officialCloseOk = false;
      for (const symbol of uniqueSymbols) {
        if (!hasOfficialCloseFor(evaluationDay, symbol)) {
          missingPairs.push({ day: evaluationDay, symbol });
        }
      }
    }
  }

  const isComplete = missingPairs.length === 0;

  return {
    mode,
    evaluationDay,
    latestPriceOk,
    officialCloseOk,
    degradedReason,
    isComplete,
    missingPairs,
  };
}
