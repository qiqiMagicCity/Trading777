"use client";

import clsx from "clsx";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";
import { useMemo, useRef } from "react";

export type LegacyStatus = "live" | "stale";
export type BadgeVariant = "ripple" | "halo" | "pill" | "static";

interface Props {
  meta?: GlobalMeta | null;
  status?: LegacyStatus;
  className?: string;
  variant?: BadgeVariant;
}

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

function Dot({
  variant,
  animate,
  state,
  dotClass,
}: {
  variant: BadgeVariant;
  animate: boolean;
  state: string;
  dotClass: string;
}) {
  if (state === "unknown") return null;
  switch (variant) {
    case "ripple":
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={clsx(
              "absolute inline-flex h-full w-full rounded-full opacity-40",
              dotClass,
              animate ? "motion-safe:animate-ping" : "",
            )}
          />
          <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", dotClass)} />
        </span>
      );
    case "halo":
      return (
        <span className={clsx("relative h-2.5 w-2.5 rounded-full", dotClass)}>
          <span className={clsx("absolute inset-[-4px] rounded-full blur-sm opacity-40", dotClass)} />
        </span>
      );
    case "pill":
      return <span className={clsx("h-1.5 w-1.5 rounded-full motion-safe:animate-pulse", dotClass)} />;
    case "static":
    default:
      return <span className={clsx("h-2 w-2 rounded-full", dotClass)} />;
  }
}

export function StatusBadge({ meta, status, className, variant }: Props) {
  // meta-only阶段：当 meta 缺失时，不再伪装为 LIVE，而是显示 UNKNOWN/未知
  // （可观测性优先，避免误导）
  const warnedLegacyStatus = useRef(false);
  const shouldUseMeta = !!meta;
  const hasMixedProps = shouldUseMeta && typeof status !== "undefined";

  if (hasMixedProps && !warnedLegacyStatus.current) {
    console.warn("[StatusBadge] meta provided; ignoring legacy 'status' prop.");
    warnedLegacyStatus.current = true;
  }

  const view = useMemo(() => {
    if (!meta) {
      return {
        state: "unknown" as const,
        token: {
          dot: "bg-gray-500",
          text: "text-gray-200",
          ring: "ring-gray-500/30",
          bg: "bg-gray-500/10",
        },
        label: "未知",
        title: "全局元信息不可用（未知状态）",
        animate: false,
      };
    }

    const mode = (meta.mode as ModeKey) ?? "live";
    const modeToken = MODE_TOKENS[mode] ?? MODE_TOKENS.live;
    let tooltipTitle: string | undefined;

    if (mode === "degraded") {
      const summary = summarizeMissingPairs(meta);
      if (summary.lines.length > 0) {
        tooltipTitle = [summary.title, ...summary.lines].join("\n");
      }
    }

    return {
      state: mode,
      token: modeToken,
      label: modeToken.label,
      title: tooltipTitle,
      animate: modeToken.animate,
    } as const;
  }, [meta]);

  return (
    <div className={clsx("flex justify-center mb-2", className)}>
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1",
          view.token.text,
          view.token.ring,
          view.token.bg,
        )}
        data-state={view.state}
        aria-live="polite"
        title={view.title}
      >
        <Dot
          variant={variant ?? "ripple"}
          animate={view.animate}
          state={view.state}
          dotClass={view.token.dot}
        />
        {view.label}
      </span>
    </div>
  );
}

export default StatusBadge;
