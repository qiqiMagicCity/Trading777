"use client";

import clsx from "clsx";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";
import { useMemo, useRef } from "react";

export type LegacyStatus = "live" | "stale";

interface Props {
  meta?: GlobalMeta | null;
  status?: LegacyStatus;
  className?: string;
}

const LEGACY_TOKENS: Record<LegacyStatus, { dot: string; text: string; ring: string; bg: string; label: string }> = {
  live: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/10",
    label: "LIVE",
  },
  stale: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
    label: "待更新",
  },
};

const MODE_TOKENS = {
  live: {
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/10",
    label: "盘中（实时）",
    animate: true,
  },
  degraded: {
    dot: "bg-amber-400",
    text: "text-amber-300",
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/10",
    label: "待更新/仅昨收基线",
    animate: false,
  },
  close: {
    dot: "bg-sky-400",
    text: "text-sky-300",
    ring: "ring-sky-500/30",
    bg: "bg-sky-500/10",
    label: "收盘口径",
    animate: false,
  },
} as const;

type ModeKey = keyof typeof MODE_TOKENS;

type MissingPairsSummary = {
  title?: string;
  lines: string[];
};

function summarizeMissingPairs(meta: GlobalMeta): MissingPairsSummary {
  if (!meta.missingPairs || meta.missingPairs.length === 0) {
    return { lines: [] };
  }
  const pairs = meta.missingPairs
    .slice(0, 10)
    .map((pair) => `${pair.day} · ${pair.symbol}`);
  if (meta.missingPairs.length > 10) {
    const rest = meta.missingPairs.length - 10;
    pairs.push(`其余 ${rest} 条…`);
  }
  const title = `缺失标的（共 ${meta.missingPairs.length} 条）`;
  return { title, lines: pairs };
}

export function StatusBadge({ meta, status, className }: Props) {
  // meta-only阶段：当 meta 缺失时，不再伪装为 LIVE，而是显示 UNKNOWN/未知
  // （可观测性优先，避免误导）
  const shouldUseMeta = !!meta;
  // meta 缺失时的兜底：展示“未知”徽标与轻提示
  if (!shouldUseMeta) {
    return (
      <div className={clsx("flex justify-center mb-2", className)}>
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1",
            "text-gray-200",
            "ring-gray-500/30",
            "bg-gray-500/10",
          )}
          data-state="unknown"
          title="全局元信息不可用（未知状态）"
        >
          未知
        </span>
      </div>
    );
  }
  const warnedLegacyStatus = useRef(false);
  const hasMixedProps = shouldUseMeta && typeof status !== "undefined";

  if (hasMixedProps && !warnedLegacyStatus.current) {
    console.warn("[StatusBadge] meta provided; ignoring legacy 'status' prop.");
    warnedLegacyStatus.current = true;
  }

  const legacyStatus = status ?? "live";

  const { token, title } = useMemo(() => {
    if (shouldUseMeta && meta) {
      const mode = meta.mode as ModeKey;
      const modeToken = MODE_TOKENS[mode] ?? MODE_TOKENS.live;
      let tooltipTitle: string | undefined;
      if (mode === "degraded") {
        const summary = summarizeMissingPairs(meta);
        if (summary.lines.length > 0) {
          tooltipTitle = [summary.title, ...summary.lines].join("\n");
        }
      }
      return { token: modeToken, title: tooltipTitle };
    }
    const legacyToken = LEGACY_TOKENS[legacyStatus];
    return { token: legacyToken, title: undefined };
  }, [legacyStatus, meta, shouldUseMeta]);

  const animate =
    shouldUseMeta && meta
      ? MODE_TOKENS[meta.mode as ModeKey]?.animate ?? false
      : legacyStatus === "live";

  return (
    <div className={clsx("flex justify-center mb-2", className)}>
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1",
          token.text,
          token.ring,
          token.bg,
        )}
        aria-live="polite"
        title={title}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={clsx(
              "absolute inline-flex h-full w-full rounded-full opacity-40",
              animate && "motion-safe:animate-ping",
              token.dot,
            )}
          />
          <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", token.dot)} />
        </span>
        {token.label}
      </span>
    </div>
  );
}

export default StatusBadge;
