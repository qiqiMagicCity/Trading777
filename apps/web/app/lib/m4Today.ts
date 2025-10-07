import { round2 } from "./money";
import type { M4TodayDetail, MetricsContract } from "./types/metrics";

export const M4_DEGRADED_REASON = "missing_official_close_prev" as const;
export const M4_DEGRADED_TOOLTIP = "因缺官方昨收，过夜=0，M4为退化值";

export interface M4TodayComponents {
  realized: number;
  mtmOvernight: number;
  mtmIntradayOpen: number;
  degraded: boolean;
  reason?: typeof M4_DEGRADED_REASON;
}

export function createM4TodayDetail(
  components: M4TodayComponents,
): M4TodayDetail {
  const realized = round2(components.realized);
  const overnight = round2(components.mtmOvernight);
  const intraday = round2(components.mtmIntradayOpen);
  const total = round2(realized + overnight + intraday);
  const degraded = Boolean(components.degraded);
  const reason = degraded ? M4_DEGRADED_REASON : undefined;
  return {
    total,
    realized,
    mtmOvernight: overnight,
    mtmIntradayOpen: intraday,
    degraded,
    ...(reason ? { reason } : {}),
  };
}

export interface M4TodaySummary {
  total: number;
  realized: number;
  mtmOvernight: number;
  mtmIntradayOpen: number;
  degraded: boolean;
  reason?: typeof M4_DEGRADED_REASON;
  tooltip?: string;
}

export function selectM4TodaySummary(
  metrics?: Pick<MetricsContract, "M4_today" | "M4"> | null,
): M4TodaySummary {
  const raw = metrics?.M4_today;
  const realized = Number.isFinite(raw?.realized)
    ? Number(raw!.realized)
    : 0;
  const overnight = Number.isFinite(raw?.mtmOvernight)
    ? Number(raw!.mtmOvernight)
    : 0;
  const intraday = Number.isFinite(raw?.mtmIntradayOpen)
    ? Number(raw!.mtmIntradayOpen)
    : 0;
  const total = Number.isFinite(raw?.total)
    ? Number(raw!.total)
    : Number.isFinite(metrics?.M4)
    ? Number(metrics!.M4)
    : realized + overnight + intraday;
  const degraded = Boolean(raw?.degraded);
  const reason = degraded ? M4_DEGRADED_REASON : undefined;
  return {
    total,
    realized,
    mtmOvernight: overnight,
    mtmIntradayOpen: intraday,
    degraded,
    ...(reason ? { reason, tooltip: M4_DEGRADED_TOOLTIP } : {}),
  };
}
