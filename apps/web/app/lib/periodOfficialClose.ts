import type {
  MetricsContract,
  PeriodOfficialCloseDateImpact,
  PeriodWindowDiagnostics,
  PeriodWindowKey,
} from "@/app/lib/types/metrics";

const WINDOW_KEYS: PeriodWindowKey[] = ["wtd", "mtd", "ytd"];

export interface PeriodOfficialCloseWindowState {
  degraded: boolean;
  missing: PeriodOfficialCloseDateImpact[];
  pending: PeriodOfficialCloseDateImpact[];
}

export type PeriodOfficialCloseSummary = Record<
  PeriodWindowKey,
  PeriodOfficialCloseWindowState
>;

const EMPTY_STATE: PeriodOfficialCloseWindowState = {
  degraded: false,
  missing: [],
  pending: [],
};

export function getPeriodOfficialCloseSummary(
  metrics: MetricsContract | null | undefined,
): PeriodOfficialCloseSummary {
  const degradedMap = metrics?._period?.degraded ?? {
    wtd: false,
    mtd: false,
    ytd: false,
  };
  const diagnostics: Partial<
    Record<PeriodWindowKey, PeriodWindowDiagnostics>
  > = metrics?._period?.diagnostics ?? {};

  const summary = WINDOW_KEYS.reduce((acc, key) => {
    const diag = diagnostics?.[key];
    const official = diag?.officialClose;
    acc[key] = {
      degraded: Boolean(degradedMap?.[key]),
      missing: official?.missing ?? [],
      pending: official?.pending ?? [],
    } satisfies PeriodOfficialCloseWindowState;
    return acc;
  }, {} as PeriodOfficialCloseSummary);

  for (const key of WINDOW_KEYS) {
    if (!summary[key]) {
      summary[key] = { ...EMPTY_STATE };
    }
  }

  return summary;
}

export function formatOfficialCloseEntries(
  entries: PeriodOfficialCloseDateImpact[],
): string[] {
  const lines: string[] = [];
  for (const entry of entries) {
    const detail = entry.symbols
      .map((symbol) => {
        const attributes: string[] = [];
        if (symbol.impact.length) {
          attributes.push(`影响：${symbol.impact.join("、")}`);
        }
        if (symbol.hasFallback) {
          attributes.push("已暂用兜底");
        }
        const suffix = attributes.length ? `（${attributes.join("，")}）` : "";
        return `${symbol.symbol}${suffix}`;
      })
      .join("、");
    lines.push(`${entry.date}：${detail}`);
  }
  return lines;
}

export function formatPendingSummary(
  entries: PeriodOfficialCloseDateImpact[],
): string | null {
  if (!entries.length) return null;
  const parts = entries.map((entry) => {
    const symbols = entry.symbols
      .map((symbol) =>
        `${symbol.symbol}${symbol.hasFallback ? "（已暂用兜底）" : ""}`,
      )
      .join("、");
    return `${entry.date}：${symbols}`;
  });
  return parts.join("；");
}
