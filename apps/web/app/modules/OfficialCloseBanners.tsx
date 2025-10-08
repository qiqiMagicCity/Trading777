"use client";

import Link from "next/link";
import { useState } from "react";

import type { MissingOfficialDateSummary } from "@/app/lib/missingOfficialClose";
import { nowNY, startOfWeekNY, ymdInNY } from "@/lib/timezone";

export function MissingOfficialCloseBanner({
  summaries,
}: {
  summaries: MissingOfficialDateSummary[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  if (!summaries.length) return null;

  const toggle = (date: string) => {
    setExpanded((prev) => ({ ...prev, [date]: !prev[date] }));
  };

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
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, color: "#ffe082" }}>官方收盘价缺失提醒</h3>
        <Link
          href={viewAllHref}
          style={{ color: "#ffd54f", fontSize: "0.9rem", textDecoration: "underline" }}
          data-testid="missing-official-view-all"
        >
          查看全部缺口
        </Link>
      </div>
      <p style={{ margin: "0 0 12px", color: "#fff8e1" }}>
        以下日期缺少官方昨收，M6 过夜部分已按 0 处理。请补录 close_prices.json 中的官方收盘价。
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {summaries.map((summary) => {
          const impacts = Array.from(
            new Set(summary.symbols.flatMap((item) => item.impact)),
          ).sort((a, b) => a.localeCompare(b));
          const impactText = impacts.length ? `影响：${impacts.join("、")}` : "";
          const symbolList = summary.symbols.map((item) => item.symbol).join("、");
          const isExpanded = Boolean(expanded[summary.ymd]);
          return (
            <li
              key={summary.ymd}
              style={{
                borderBottom: "1px solid rgba(255, 214, 102, 0.3)",
                padding: "8px 0",
              }}
            >
              <button
                type="button"
                onClick={() => toggle(summary.ymd)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffe082",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 0,
                }}
              >
                <span style={{ fontWeight: 600 }}>{summary.ymd}</span>
                <span>{symbolList}</span>
                {impactText && (
                  <span
                    style={{
                      color: "#ffecb3",
                      fontSize: "0.85rem",
                      opacity: 0.9,
                    }}
                  >
                    {impactText}
                  </span>
                )}
                <span style={{ color: "#ffe082", fontSize: "0.75rem" }}>
                  {isExpanded ? "收起" : "展开"}
                </span>
              </button>
              {isExpanded && (
                <ul style={{ margin: "8px 0 0 12px", padding: 0, listStyle: "disc" }}>
                  {summary.symbols.map((item) => (
                    <li key={`${summary.ymd}-${item.symbol}`} style={{ marginBottom: 4 }}>
                      <strong>{item.symbol}</strong>：
                      {item.impact.length ? item.impact.join("、") : "影响未指定"}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const MissingOfficialCloseAlert = MissingOfficialCloseBanner;

export function PendingOfficialCloseBanner({
  summaries,
}: {
  summaries: MissingOfficialDateSummary[];
}) {
  if (!summaries.length) return null;
  return (
    <div
      style={{
        background: "rgba(59,130,246,0.12)",
        border: "1px solid rgba(59,130,246,0.4)",
        borderRadius: 8,
        color: "#dbeafe",
        margin: "16px auto",
        maxWidth: "var(--page-max)",
        padding: "14px 16px",
        width: "90%",
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, color: "#bfdbfe" }}>
        等待官方收盘价落地
      </h3>
      <p style={{ margin: "0 0 12px", color: "#e0f2fe", lineHeight: 1.6 }}>
        今日仍在官方收盘价落地窗口内，以下标的暂沿用兜底估值。
      </p>
      <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 20 }}>
        {summaries.map((summary) => {
          const label = summary.symbols.map((item) => item.symbol).join("、");
          return (
            <li key={`pending-${summary.ymd}`} style={{ marginBottom: 6 }}>
              <strong>{summary.ymd}</strong>：{label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const PendingOfficialCloseAlert = PendingOfficialCloseBanner;
