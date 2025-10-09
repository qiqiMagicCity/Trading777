"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";

import type {
  MissingOfficialDateSummary,
  MissingOfficialSymbolSummary,
} from "@/app/lib/missingOfficialClose";
import { attachPricesImportedListener } from "@/app/lib/bootstrap/pricesImportedListener";
import {
  getOfficialCloseVersion,
  getMissingOfficialCloses,
  waitOfficialClosesReady,
} from "@/app/lib/prices/officialCloseFacade";
import { nowNY, startOfWeekNY, ymdInNY } from "@/lib/timezone";
import { previousTradingDay, resolveTradingDayStr } from "@/app/lib/nyDay";

type MissingOfficialCloseMap = Record<string, MissingOfficialSymbolSummary[]>;

interface MissingBannerHookResult {
  summaries: MissingOfficialDateSummary[];
  refresh: () => Promise<void>;
  error: Error | null;
}

function normalizeSummaryMap(map: MissingOfficialCloseMap | null): MissingOfficialDateSummary[] {
  if (!map) return [];
  return Object.entries(map)
    .map(([ymd, symbols]) => ({
      ymd,
      date: ymd,
      symbols: symbols
        .slice()
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    }))
    .sort((a, b) => b.ymd.localeCompare(a.ymd));
}

function useMissingOfficialCloses(
  initialSummaries: MissingOfficialDateSummary[] = [],
): MissingBannerHookResult {
  const [data, setData] = useState<MissingOfficialCloseMap | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      await waitOfficialClosesReady();
      const missing = await getMissingOfficialCloses();
      setData(missing);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onPricesImported = async () => {
      try {
        const baseVersion = getOfficialCloseVersion();
        await waitOfficialClosesReady(baseVersion + 1);
        await load();
      } catch (err) {
        console.warn("[OfficialCloseBanners] refresh after import failed", err);
      }
    };

    const detachImported = attachPricesImportedListener(() => {
      void onPricesImported();
    });
    const handleReady = () => {
      void load();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("pricesReady", handleReady);
    }
    return () => {
      if (detachImported) detachImported();
      if (typeof window !== "undefined") {
        window.removeEventListener("pricesReady", handleReady);
      }
    };
  }, [load]);

  const summaries = useMemo(() => {
    if (data) return normalizeSummaryMap(data);
    return initialSummaries;
  }, [data, initialSummaries]);

  return { summaries, refresh: load, error };
}

export function MissingOfficialCloseBanner({
  summaries: summariesProp = [],
}: {
  summaries?: MissingOfficialDateSummary[];
}) {
  const { summaries } = useMissingOfficialCloses(summariesProp);
  const [copied, setCopied] = useState(false);

  const now = nowNY();
  const defaultFrom = ymdInNY(startOfWeekNY(now));
  const defaultTo = ymdInNY(now);
  const symbolFilter = Array.from(
    new Set(
      summaries.flatMap((summary) =>
        summary.symbols.map((item) => item.symbol).filter(Boolean),
      ),
    ),
  )
    .sort()
    .join(",");
  const impactFilter = encodeURIComponent("WTD/MTD/YTD端点浮盈可能失真");
  const viewAllHref =
    `/diagnostics/official-closes?status=missing&from=${defaultFrom}&to=${defaultTo}&impacts=${impactFilter}` +
    (symbolFilter ? `&symbols=${encodeURIComponent(symbolFilter)}` : "");
  const grouped = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const summary of summaries) {
      const day = summary?.ymd ?? summary?.date;
      if (!day) continue;
      const bucket = map.get(day) ?? new Set<string>();
      for (const symbol of summary.symbols ?? []) {
        if (!symbol?.symbol) continue;
        bucket.add(symbol.symbol.toUpperCase());
      }
      if (bucket.size > 0) {
        map.set(day, bucket);
      }
    }
    return Array.from(map.entries())
      .map(([day, set]) => ({
        day,
        symbols: Array.from(set.values()).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [summaries]);

  if (!grouped.length) return null;

  const copyPayload = grouped.map((item) => `${item.day}：${item.symbols.join("、")}`).join("\n");

  const handleCopy = useCallback(async () => {
    if (!copyPayload) return;
    try {
      await navigator.clipboard?.writeText(copyPayload);
      setCopied(true);
    } catch (err) {
      console.warn("[OfficialCloseBanners] copy failed", err);
    }
  }, [copyPayload]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const evalDay = resolveTradingDayStr(now);
  const prevDay = previousTradingDay(evalDay);
  const debugHref = `/debug/close?eval=${encodeURIComponent(evalDay)}${prevDay ? `&prev=${encodeURIComponent(prevDay)}` : ""}`;

  return (
    <div
      style={{
        background: "rgba(255, 171, 0, 0.14)",
        border: "1px solid rgba(255, 171, 0, 0.6)",
        borderRadius: 8,
        color: "#fff3cd",
        margin: "16px auto",
        maxWidth: "var(--page-max)",
        padding: "16px 18px",
        width: "90%",
      }}
    >
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 style={{ margin: 0, color: "#ffe082" }}>官方收盘价缺失提醒</h3>
          <p style={{ margin: 0, color: "#fff8e1", lineHeight: 1.6 }}>
            系统按纽约交易日计算，当天(E)需要用到上一交易日(E-1)的官方昨收价。请补 E-1 的官方价，补齐后本提示自动消失。
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: "rgba(255, 214, 102, 0.25)",
              border: "1px solid rgba(255, 214, 102, 0.6)",
              borderRadius: 6,
              color: "#263238",
              cursor: "pointer",
              fontSize: "0.85rem",
              padding: "6px 10px",
            }}
            data-testid="missing-official-copy"
          >
            复制待补清单
          </button>
          <Link
            href={debugHref}
            style={{
              alignItems: "center",
              background: "rgba(255, 214, 102, 0.15)",
              border: "1px solid rgba(255, 214, 102, 0.4)",
              borderRadius: 6,
              color: "#ffd54f",
              display: "inline-flex",
              fontSize: "0.85rem",
              padding: "6px 10px",
              textDecoration: "none",
            }}
          >
            为什么缺价？
          </Link>
          <Link
            href={viewAllHref}
            style={{ color: "#ffd54f", fontSize: "0.9rem", textDecoration: "underline", alignSelf: "center" }}
            data-testid="missing-official-view-all"
          >
            查看全部缺口
          </Link>
        </div>
      </div>
      <ul style={{ listStyle: "disc", margin: "12px 0 0", paddingLeft: 20 }}>
        {grouped.map((item) => (
          <li key={item.day} style={{ marginBottom: 6, color: "#fff8e1" }}>
            <strong>{item.day}</strong>：{item.symbols.join("、")}
          </li>
        ))}
      </ul>
      {copied && (
        <div style={{ marginTop: 8, color: "#ffe082", fontSize: "0.8rem" }} role="status">
          已复制到剪贴板
        </div>
      )}
    </div>
  );
}

export const MissingOfficialCloseAlert = MissingOfficialCloseBanner;

export function PendingOfficialCloseBanner({
  summaries,
}: {
  summaries: MissingOfficialDateSummary[];
}) {
  const [visible, setVisible] = useState(() => summaries.length > 0);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hideTimeout, setHideTimeout] = useState<number | null>(null);

  useEffect(() => {
    if (summaries.length > 0) {
      if (hideTimeout !== null) {
        window.clearTimeout(hideTimeout);
        setHideTimeout(null);
      }
      setVisible(true);
      setIsFadingOut(false);
      return;
    }

    if (!visible) return;

    setIsFadingOut(true);
    const timeout = window.setTimeout(() => {
      setVisible(false);
      setIsFadingOut(false);
      setHideTimeout(null);
    }, 320);

    setHideTimeout(timeout);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [summaries, visible]);

  if (!visible) return null;

  const containerStyles: CSSProperties = {
    position: "fixed",
    top: 24,
    right: 24,
    zIndex: 1200,
    maxWidth: 320,
    width: "calc(100vw - 48px)",
    pointerEvents: "auto",
  };

  const toastStyles: CSSProperties = {
    background: "rgba(59,130,246,0.92)",
    borderRadius: 10,
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.35)",
    color: "#f8fafc",
    padding: "14px 16px",
    fontSize: "0.9rem",
    lineHeight: 1.5,
    backdropFilter: "blur(12px)",
    transition: "opacity 0.3s ease, transform 0.3s ease",
    opacity: isFadingOut ? 0 : 1,
    transform: isFadingOut ? "translateY(-8px)" : "translateY(0)",
  };

  const headerStyles: CSSProperties = {
    fontWeight: 600,
    margin: 0,
    marginBottom: 4,
    fontSize: "0.95rem",
    color: "#e0f2fe",
  };

  const descriptionStyles: CSSProperties = {
    margin: "0 0 8px",
    color: "#e2e8f0",
    fontSize: "0.85rem",
  };

  return (
    <div style={containerStyles} data-testid="pending-official-close-toast">
      <div style={toastStyles} role="status" aria-live="polite">
        <h3 style={headerStyles}>等待官方收盘价落地</h3>
        <p style={descriptionStyles}>
          今日仍在官方收盘价落地窗口内，系统暂沿用兜底估值，请关注下列标的：
        </p>
        <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 20 }}>
          {summaries.map((summary) => {
            const label = summary.symbols
              .map((item) =>
                item.symbol
                  ? `${item.symbol}${item.hasFallback ? "（已暂用兜底）" : ""}`
                  : null,
              )
              .filter((value): value is string => Boolean(value))
              .join("、");
            return (
              <li
                key={`pending-${summary.ymd}`}
                style={{ marginBottom: 4, color: "#f1f5f9", fontSize: "0.82rem" }}
              >
                <strong>{summary.ymd}</strong>：{label}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export const PendingOfficialCloseAlert = PendingOfficialCloseBanner;
