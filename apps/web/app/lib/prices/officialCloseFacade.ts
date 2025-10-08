import {
  buildOfficialCloseMaps,
  commitOfficialCloseVersion,
  getOfficialCloseVersion,
} from "@/app/lib/prices/buildOfficialCloseMaps";
import { summarizeMissingOfficialCloses } from "@/app/lib/diagnostics/missingBanner";
import type { MissingOfficialSymbolSummary } from "@/app/lib/missingOfficialClose";
import { waitUntilAtLeast } from "@/app/lib/prices/ready";
import { useStore } from "@/app/lib/store";

export type MissingOfficialCloseMap = Record<string, MissingOfficialSymbolSummary[]>;

export { getOfficialCloseVersion };

export async function waitOfficialClosesReady(targetVersion?: number) {
  const baseVersion =
    typeof targetVersion === "number" ? targetVersion : getOfficialCloseVersion();
  await waitUntilAtLeast(baseVersion);
}

export async function refreshOfficialCloseMaps(): Promise<number> {
  const { version } = await buildOfficialCloseMaps();
  commitOfficialCloseVersion(version);
  const setVersion = useStore.getState().setOfficialCloseVersion;
  setVersion(version);
  return version;
}

export async function getMissingOfficialCloses(
  targetVersion?: number,
): Promise<MissingOfficialCloseMap> {
  const version =
    typeof targetVersion === "number" ? targetVersion : getOfficialCloseVersion();
  await waitOfficialClosesReady(version);
  const metrics = useStore.getState().metrics;
  const entries = metrics?.diagnostics?.missingOfficialCloses ?? [];
  const summaries = summarizeMissingOfficialCloses(entries);
  const map: MissingOfficialCloseMap = {};
  for (const summary of summaries) {
    map[summary.ymd] = summary.symbols.slice();
  }
  return map;
}
