"use client";

import clsx from "clsx";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";
import { useMemo } from "react";

export type LegacyStatus = "live" | "stale";

interface Props {
  meta?: GlobalMeta | null;
  status?: LegacyStatus;
  className?: string;
}

const ENABLED = process.env.NEXT_PUBLIC_MODE_ENGINE_V2 === "1";

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

export function StatusBadge({ meta, status = "live", className }: Props) {
  const shouldUseMeta = ENABLED && meta;

  const { token, title } = useMemo(() => {
    if (shouldUseMeta && meta) {
      const mode = meta.mode as ModeKey;
      const modeToken = MODE_TOKENS[mode];
      let tooltipTitle: string | undefined;
      if (mode === "degraded") {
        const summary = summarizeMissingPairs(meta);
        if (summary.lines.length > 0) {
          tooltipTitle = [summary.title, ...summary.lines].join("\n");
        }
      }
      return { token: modeToken, title: tooltipTitle };
    }
    const legacyToken = LEGACY_TOKENS[status];
    return { token: legacyToken, title: undefined };
  }, [meta, shouldUseMeta, status]);

  const animate = shouldUseMeta && meta ? MODE_TOKENS[meta.mode as ModeKey].animate : status === "live";

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
