"use client";

import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import { useStore } from "@/lib/store";
import {
  explainWtdMtdYtdFromSnapshots,
  formatCurrency,
  normalizeMetrics,
  isDebug,
} from "@/app/lib/metrics";
import type { MetricsContract } from "@/app/lib/types/metrics";
import { loadDailyResults } from "@/app/lib/services/dataService";
import { getLatestTradingDayStr } from "@/lib/timezone";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * DashboardMetrics 组件的属性接口
 */
interface Props {
  /** 交易记录数组 */
  enrichedTrades: EnrichedTrade[];
  /** 持仓数组 */
  positions: Position[];
}

/**
 * 指标卡片组件，显示单个指标的值
 */
function MetricCard({
  title,
  value,
  colorClass,
  dataTestId,
}: {
  title: string;
  value: ReactNode;
  colorClass?: string;
  dataTestId?: string;
}) {
  return (
    <div className="box" data-testid={dataTestId}>
      <div className="title">{title}</div>
      <div className={`value ${colorClass || ""}`}>{value}</div>
    </div>
  );
}

/**
 * 交易指标仪表盘组件
 * 显示所有交易系统指标的卡片视图
 */
export function DashboardMetrics({ enrichedTrades, positions }: Props) {
  // 从全局状态获取指标
  const rawMetrics = useStore((state) => state.metrics);
  const metrics = normalizeMetrics(rawMetrics);
  const debugEnabled =
    isDebug() || process.env.NEXT_PUBLIC_METRICS_DEBUG === "1";
  const debugLoggedRef = useRef(false);

  const periodValues = useMemo(() => {
    const raw = rawMetrics as Record<string, unknown> | null;
    const pick = (candidate: unknown): number | undefined =>
      typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : undefined;
    const resolve = (
      candidates: Array<unknown>,
    ): number | undefined => {
      for (const candidate of candidates) {
        const value = pick(candidate);
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    };

    return {
      M11: resolve([
        metrics?.M11,
        raw?.M11,
        raw?.wtd,
        raw?.WTD,
      ]),
      M12: resolve([
        metrics?.M12,
        raw?.M12,
        raw?.mtd,
        raw?.MTD,
      ]),
      M13: resolve([
        metrics?.M13,
        raw?.M13,
        raw?.ytd,
        raw?.YTD,
      ]),
    } as const;
  }, [metrics, rawMetrics]);

  useEffect(() => {
    if (!debugEnabled) return;
    if (!rawMetrics) return;
    const payload = {
      WTD: periodValues.M11 ?? null,
      MTD: periodValues.M12 ?? null,
      YTD: periodValues.M13 ?? null,
    };
    // eslint-disable-next-line no-console
    console.debug("PERIOD-CARDS", payload);
  }, [debugEnabled, periodValues, rawMetrics]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (debugLoggedRef.current) return;
    const usp = new URLSearchParams(window.location.search);
    if (usp.get("debugM11") !== "1") return;
    if (!rawMetrics) return;

    debugLoggedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const dailyResults = await loadDailyResults();
        if (cancelled) return;
        const freeze = process.env.NEXT_PUBLIC_FREEZE_DATE?.slice(0, 10);
        const evalDayStr =
          freeze && /^\d{4}-\d{2}-\d{2}$/.test(freeze)
            ? freeze
            : getLatestTradingDayStr();
        const detail = explainWtdMtdYtdFromSnapshots(dailyResults, evalDayStr);
        // eslint-disable-next-line no-console
        console.log("[M11/M12/M13 debug]", detail);
        if (typeof console.table === "function") {
          // eslint-disable-next-line no-console
          console.table(
            detail.rows.map((r) => ({
              day: r.day,
              realized: r.realized,
              unrealized: r.unrealized,
              pnl: r.pnl,
            })),
          );
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("debugM11 failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawMetrics]);

  // 定义指标名称映射
  const metricNames: Partial<Record<keyof MetricsContract, string>> = useMemo(
    () => ({
      M1: "持仓成本",
      M2: "持仓市值",
      M3: "持仓浮盈",
      M4: "今天持仓平仓盈利",
      M5: "今日日内交易盈利",
      M6: "今日总盈利变化",
      M7: "今日交易次数",
      M8: "累计交易次数",
      M9: "所有历史平仓盈利",
      M10: "胜率",
      M11: "WTD",
      M12: "MTD",
      M13: "YTD",
    }),
    [],
  );

  // 按顺序渲染所有指标卡片
  const order: (keyof MetricsContract)[] = useMemo(
    () => [
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
      "M10",
      "M11",
      "M12",
      "M13",
    ],
    [],
  );

  // 格式化指标值并确定颜色
  const formattedMetrics = useMemo(() => {
    if (!metrics) return [];
    return order.map((key) => {
      const value =
        key === "M11"
          ? (periodValues.M11 ?? 0)
          : key === "M12"
          ? (periodValues.M12 ?? 0)
          : key === "M13"
          ? (periodValues.M13 ?? 0)
          : metrics[key];
      let formattedValue: ReactNode;
      let colorClass = "";
      const dataTestId =
        key === "M11"
          ? "metric-wtd"
          : key === "M12"
          ? "metric-mtd"
          : key === "M13"
          ? "metric-ytd"
          : undefined;

      // 根据不同指标类型格式化值
      if (key === "M5") {
        const m5 = value as MetricsContract["M5"];
        formattedValue = (
          <>
            <span
              className={
                m5.behavior > 0 ? "green" : m5.behavior < 0 ? "red" : undefined
              }
            >
              交易: {formatCurrency(m5.behavior)}
            </span>
            <br />
            <span
              className={
                m5.fifo > 0 ? "green" : m5.fifo < 0 ? "red" : undefined
              }
            >
              FIFO: {formatCurrency(m5.fifo)}
            </span>
          </>
        );
      } else if (key === "M7" || key === "M8") {
        const counts = value as MetricsContract["M7"] | MetricsContract["M8"];
        formattedValue = (
          <>
            <span className="green">B/{counts.B}</span>{" "}
            <span className="red">S/{counts.S}</span>{" "}
            <span className="purple">P/{counts.P}</span>{" "}
            <span className="blue">C/{counts.C}</span>
            <br />【{counts.total}】
          </>
        );
      } else if (key === "M10") {
        const m10 = value as MetricsContract["M10"];
        formattedValue = (
          <>
            <span className="green">W/{m10.win}</span>{" "}
            <span className="red">L/{m10.loss}</span>{" "}
            <span>{(m10.rate * 100).toFixed(1)}%</span>
          </>
        );
      } else {
        const numValue =
          key === "M4" || key === "M6"
            ? (value as { total: number }).total
            : (value as number);
        formattedValue = formatCurrency(numValue);

        // 设置颜色
        if (
          ["M1", "M2", "M3", "M4", "M6", "M9", "M11", "M12", "M13"].includes(
            key,
          )
        ) {
          colorClass = numValue > 0 ? "green" : numValue < 0 ? "red" : "";
        }
      }

      return {
        key,
        title: metricNames[key],
        value: formattedValue,
        colorClass,
        dataTestId,
      };
    });
  }, [metrics, metricNames, order, periodValues]);

  const rows = useMemo(
    () => [
      formattedMetrics.slice(0, 3),
      formattedMetrics.slice(3, 7),
      formattedMetrics.slice(7, 13),
    ].filter((row) => row.length > 0),
    [formattedMetrics],
  );

  const rowClassNames = [
    "grid grid-cols-3 gap-4 justify-items-center",
    "grid grid-cols-4 gap-4 justify-items-center",
    "grid grid-cols-6 gap-4 justify-items-center",
  ];

  if (!metrics) {
    return <section id="stats" className="stats-grid">正在加载指标...</section>;
  }

  return (
    <section id="stats" className="my-5">
      <div className="flex flex-col items-center gap-4">
        {rows.map((row, index) => (
          <div key={index} className={rowClassNames[index] ?? "grid gap-4"}>
            {row.map((metric) => (
              <MetricCard
                key={metric.key}
                title={metric.title!}
                value={metric.value}
                colorClass={metric.colorClass}
                dataTestId={metric.dataTestId}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
