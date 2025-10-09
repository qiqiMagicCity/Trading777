import { summarizeMissingOfficialCloses } from "@/app/lib/diagnostics/missingBanner";
import type { MissingOfficialCloseEntry } from "@/app/lib/types/metrics";

export const FALLBACK_MISSING_DATES: string[] = [
  "2025-09-19",
  "2025-10-03",
  "2025-10-06",
];

export function deriveMissingDateCandidates(
  entries?: MissingOfficialCloseEntry[] | null,
): string[] {
  const summaries = summarizeMissingOfficialCloses(entries ?? []);
  const uniqueDates = new Set<string>();
  for (const summary of summaries) {
    if (summary?.ymd && summary.ymd.length === 10) {
      uniqueDates.add(summary.ymd);
    }
  }
  if (uniqueDates.size > 0) {
    return Array.from(uniqueDates.values()).sort((a, b) => a.localeCompare(b));
  }
  return [...FALLBACK_MISSING_DATES];
}

export function stringifyMissingDates(dates: string[]): string {
  return dates.join(",");
}
