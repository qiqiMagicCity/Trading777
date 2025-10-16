"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobalMeta } from "@/app/lib/mode/globalMeta";
import clsx from "clsx";

interface Props {
  meta?: GlobalMeta | null;
}

const MODE_ENGINE_V2_ENABLED = process.env.NEXT_PUBLIC_MODE_ENGINE_V2 === "1";

export function ModePopover({ meta }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!containerRef.current || !target) return;
      if (!containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  useEffect(() => {
    if (!meta) {
      setOpen(false);
    }
  }, [meta]);

  const missingSummary = useMemo(() => {
    if (!meta || !meta.missingPairs?.length) {
      return { items: [] as Array<{ day: string; symbol: string }>, rest: 0 };
    }
    const items = meta.missingPairs.slice(0, 10);
    const rest = meta.missingPairs.length - items.length;
    return { items, rest };
  }, [meta]);

  if (!MODE_ENGINE_V2_ENABLED || !meta) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        className={clsx(
          "flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-[10px] font-semibold",
          "text-emerald-50 transition hover:bg-emerald-500/20",
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        i
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-emerald-500/40 bg-slate-900/95 p-3 text-xs text-emerald-50 shadow-lg backdrop-blur">
          <div className="text-sm font-semibold text-emerald-200">模式诊断</div>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">mode</dt>
              <dd className="text-emerald-50">{meta.mode}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">evaluationDay</dt>
              <dd className="text-emerald-50">{meta.evaluationDay}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">latestPriceOk</dt>
              <dd className={clsx(meta.latestPriceOk ? "text-emerald-200" : "text-amber-300")}>
                {meta.latestPriceOk ? "true" : "false"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">officialCloseOk</dt>
              <dd className={clsx(meta.officialCloseOk ? "text-emerald-200" : "text-amber-300")}>
                {meta.officialCloseOk ? "true" : "false"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">isComplete</dt>
              <dd className={clsx(meta.isComplete ? "text-emerald-200" : "text-amber-300")}>
                {meta.isComplete ? "true" : "false"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-emerald-200/70">degradedReason</dt>
              <dd className="text-emerald-50">{meta.degradedReason ?? "-"}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <div className="text-emerald-200/80">缺失标的</div>
            {missingSummary.items.length === 0 ? (
              <div className="mt-1 text-emerald-50/80">无</div>
            ) : (
              <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto pr-1 text-emerald-100">
                {missingSummary.items.map((pair) => (
                  <li key={`${pair.day}-${pair.symbol}`} className="flex justify-between gap-2">
                    <span className="font-mono">{pair.symbol}</span>
                    <span className="text-emerald-200/80">{pair.day}</span>
                  </li>
                ))}
                {missingSummary.rest > 0 ? (
                  <li className="text-emerald-200/70">其余 {missingSummary.rest} 条…</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ModePopover;
