"use client";

import clsx from "clsx";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";
import { useMemo, useRef } from "react";

export type LegacyStatus = "live" | "stale";
type BadgeState = "live" | "degraded" | "close" | "unknown";
export type BadgeVariant = "ripple" | "halo" | "pill" | "static";

interface Props {
  meta?: GlobalMeta | null;
  status?: LegacyStatus;
  className?: string;
  variant?: BadgeVariant;
  forceMotion?: boolean;
}

const TOKENS: Record<
  BadgeVariant,
  Record<
    BadgeState,
    {
      text: string;
      ring: string;
      bg: string;
      dot?: string;
      animate: boolean;
      label?: string;
    }
  >
> = {
  ripple: {
    live: {
      text: "text-emerald-300",
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/10",
      dot: "bg-emerald-400",
      animate: true,
      label: "盘中（实时）",
    },
    degraded: {
      text: "text-amber-300",
      ring: "ring-amber-500/30",
      bg: "bg-amber-500/10",
      dot: "bg-amber-400",
      animate: false,
      label: "待更新/仅昨收基线",
    },
    close: {
      text: "text-sky-300",
      ring: "ring-sky-500/30",
      bg: "bg-sky-500/10",
      dot: "bg-sky-400",
      animate: false,
      label: "收盘口径",
    },
    unknown: {
      text: "text-gray-200",
      ring: "ring-gray-500/30",
      bg: "bg-gray-500/10",
      animate: false,
      label: "未知",
    },
  },
  halo: {
    live: {
      text: "text-emerald-300",
      ring: "ring-2 ring-emerald-400/50",
      bg: "bg-emerald-500/10",
      dot: "bg-emerald-400",
      animate: true,
      label: "盘中（实时）",
    },
    degraded: {
      text: "text-amber-300",
      ring: "ring-2 ring-amber-400/50",
      bg: "bg-amber-500/10",
      dot: "bg-amber-400",
      animate: false,
      label: "待更新/仅昨收基线",
    },
    close: {
      text: "text-sky-300",
      ring: "ring-2 ring-sky-400/50",
      bg: "bg-sky-500/10",
      dot: "bg-sky-400",
      animate: false,
      label: "收盘口径",
    },
    unknown: {
      text: "text-gray-200",
      ring: "ring-2 ring-gray-400/40",
      bg: "bg-gray-500/10",
      animate: false,
      label: "未知",
    },
  },
  pill: {
    live: {
      text: "text-emerald-300",
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/10",
      dot: "bg-emerald-400",
      animate: true,
      label: "盘中（实时）",
    },
    degraded: {
      text: "text-amber-300",
      ring: "ring-amber-500/30",
      bg: "bg-amber-500/10",
      dot: "bg-amber-400",
      animate: false,
      label: "待更新/仅昨收基线",
    },
    close: {
      text: "text-sky-300",
      ring: "ring-sky-500/30",
      bg: "bg-sky-500/10",
      dot: "bg-sky-400",
      animate: false,
      label: "收盘口径",
    },
    unknown: {
      text: "text-gray-200",
      ring: "ring-gray-500/30",
      bg: "bg-gray-500/10",
      animate: false,
      label: "未知",
    },
  },
  static: {
    live: {
      text: "text-emerald-300",
      ring: "ring-emerald-500/30",
      bg: "bg-emerald-500/10",
      dot: "bg-emerald-400",
      animate: false,
      label: "盘中（实时）",
    },
    degraded: {
      text: "text-amber-300",
      ring: "ring-amber-500/30",
      bg: "bg-amber-500/10",
      dot: "bg-amber-400",
      animate: false,
      label: "待更新/仅昨收基线",
    },
    close: {
      text: "text-sky-300",
      ring: "ring-sky-500/30",
      bg: "bg-sky-500/10",
      dot: "bg-sky-400",
      animate: false,
      label: "收盘口径",
    },
    unknown: {
      text: "text-gray-200",
      ring: "ring-gray-500/30",
      bg: "bg-gray-500/10",
      animate: false,
      label: "未知",
    },
  },
};

type MissingPairsSummary = {
  title?: string;
  lines: string[];
};

function summarizeMissingPairs(meta: GlobalMeta): MissingPairsSummary {
  if (!meta.missingPairs || meta.missingPairs.length === 0) {
    return { lines: [] };
  }
  const limit = 10;
  const pairs = meta.missingPairs
    .slice(0, limit)
    .map((pair) => `${pair.day} · ${pair.symbol}`);
  const rest = meta.missingPairs.length - pairs.length;
  if (rest > 0) {
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
  pingClass,
  pulseClass,
}: {
  variant: BadgeVariant;
  animate: boolean;
  state: BadgeState;
  dotClass?: string;
  pingClass: string;
  pulseClass: string;
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
              animate && pingClass,
            )}
          />
          <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", dotClass)} />
        </span>
      );
    case "halo":
      return (
        <span className={clsx("relative h-2.5 w-2.5 rounded-full", dotClass)}>
          <span
            className={clsx(
              "absolute inset-[-4px] rounded-full blur-sm opacity-40",
              dotClass,
              animate && pingClass,
            )}
          />
        </span>
      );
    case "pill":
      return (
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            dotClass,
            animate && pulseClass,
          )}
        />
      );
    case "static":
    default:
      return <span className={clsx("h-2 w-2 rounded-full", dotClass)} />;
  }
}

export function StatusBadge(props: Props) {
  const { meta, status, className, variant } = props;
  // meta-only阶段：当 meta 缺失时，不再伪装为 LIVE，而是显示 UNKNOWN/未知
  // （可观测性优先，避免误导）
  const warnedLegacyStatus = useRef(false);
  const shouldUseMeta = !!meta;
  const hasMixedProps = shouldUseMeta && typeof status !== "undefined";

  const resolvedVariant = variant ?? "ripple";

  // --- 动效/视觉覆盖策略 ---
  const forceMotionEnv =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_FORCE_BADGE_MOTION === "1";
  const forceVisualEnv =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_FORCE_BADGE_VISUAL === "1";
  const respectReducedMotionEnv =
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_RESPECT_REDUCED_MOTION === "1";

  // 外部 props、强制动效 与 强制视觉 三者任一为真，则视为“必须动”
  const forceMotion = !!props.forceMotion || forceMotionEnv || forceVisualEnv;

  // 默认：**不尊重** reduced-motion（给你当前诉求的默认行为：总是动）
  // 如需恢复无障碍友好，在环境中设置 NEXT_PUBLIC_RESPECT_REDUCED_MOTION=1
  const pingClass =
    respectReducedMotionEnv && !forceMotion
      ? "motion-safe:animate-ping"
      : "animate-ping";
  const pulseClass =
    respectReducedMotionEnv && !forceMotion
      ? "motion-safe:animate-pulse"
      : "animate-pulse";

  if (hasMixedProps && !warnedLegacyStatus.current) {
    console.warn("[StatusBadge] meta provided; ignoring legacy 'status' prop.");
    warnedLegacyStatus.current = true;
  }

    const view = useMemo(() => {
      const variantTokens = TOKENS[resolvedVariant];

      // 强制视觉时，无论 meta 存在与否，都走 "live"+动画
      if (forceVisualEnv) {
        const token = variantTokens.live;
        return {
          state: "live" as const,
          token,
          label: token.label ?? "盘中（实时）",
          title: "强制视觉：live",
          animate: true,
        };
      }

      if (!meta) {
        const token = variantTokens.unknown;
        return {
          state: "unknown" as const,
          token,
          label: token.label ?? "未知",
          title: "全局元信息不可用（未知状态）",
          animate: token.animate,
        };
      }

      const mode = (meta.mode as BadgeState) ?? "live";
      const token = variantTokens[mode] ?? variantTokens.live;
      let tooltipTitle: string | undefined;

    if (mode === "degraded") {
      const summary = summarizeMissingPairs(meta);
      if (summary.lines.length > 0) {
        tooltipTitle = [summary.title, ...summary.lines].join("\n");
      }
    }

      return {
        state: mode,
        token,
        label: token.label ?? "",
        title: tooltipTitle,
        // 如果开启了强制动效（但不强制视觉），沿用当前视觉 token，但**强制开动画**
        animate: forceMotion ? true : token.animate,
      } as const;
    }, [meta, resolvedVariant, forceMotion, forceVisualEnv]);

  return (
    <div className={clsx("flex justify-center mb-2", className)}>
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ring-1",
          view.token.text,
          view.token.ring,
          view.token.bg,
        )}
        data-variant={resolvedVariant}
        data-state={view.state}
        aria-live="polite"
        role="status"
        title={view.title}
      >
        <Dot
          variant={resolvedVariant}
          animate={view.animate}
          state={view.state}
          dotClass={view.token.dot}
          pingClass={pingClass}
          pulseClass={pulseClass}
        />
        {resolvedVariant === "halo" && view.animate
          ? <span className={pulseClass}>{view.label}</span>
          : view.label}
      </span>
    </div>
  );
}

export default StatusBadge;
