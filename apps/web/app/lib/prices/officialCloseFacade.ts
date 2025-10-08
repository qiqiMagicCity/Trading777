import { buildOfficialCloseMaps } from "@/app/lib/prices/buildOfficialCloseMaps";
import { summarizeMissingOfficialCloses } from "@/app/lib/diagnostics/missingBanner";
import type { MissingOfficialSymbolSummary } from "@/app/lib/missingOfficialClose";
import { pricesReady } from "@/app/lib/prices/ready";
import { useStore } from "@/app/lib/store";

export type MissingOfficialCloseMap = Record<string, MissingOfficialSymbolSummary[]>;

export async function waitOfficialClosesReady() {
  await pricesReady();
}

export async function getMissingOfficialCloses(): Promise<MissingOfficialCloseMap> {
  await buildOfficialCloseMaps();
  const metrics = useStore.getState().metrics;
  const entries = metrics?.diagnostics?.missingOfficialCloses ?? [];
  const summaries = summarizeMissingOfficialCloses(entries);
  const map: MissingOfficialCloseMap = {};
  for (const summary of summaries) {
    map[summary.ymd] = summary.symbols.slice();
  }
  return map;
}
