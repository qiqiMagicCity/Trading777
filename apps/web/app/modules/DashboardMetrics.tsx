"use client";

import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import { useStore } from "@/lib/store";
import {
  formatCurrency,
  normalizeMetrics,
  isDebug,
  getLastWtdMtdYtdExplain,
} from "@/app/lib/metrics";
import type { MetricsContract } from "@/app/lib/types/metrics";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MissingCloseFallback } from "@/app/lib/dailyResults";

const FALLBACK_LABELS: Record<MissingCloseFallback, string> = {
  MARK_PRICE: "使用最新价兜底",
  PREVIOUS_CLOSE: "沿用上一日价格",
  AVERAGE_COST: "使用均价兜底",
};

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
  const periodHealth = useStore((state) => state.periodHealth);
  const metrics = normalizeMetrics(rawMetrics);
  const debugEnabled =
    isDebug() || process.env.NEXT_PUBLIC_METRICS_DEBUG === "1";

  const periodStatus = periodHealth?.status ?? "ok";

  const periodMeta = rawMetrics?._period;
  const periodStatusMap = periodMeta?.status;
  const periodBreakdown = periodMeta?.breakdown;

  type PeriodCardState =
    | "ok"
    | "missing"
    | "ignored"
    | "degraded"
    | "partial";

  const periodCardStates = useMemo(() => {
    const degraded = periodHealth?.degraded ?? periodMeta?.degraded;
    const map: Record<"M11" | "M12" | "M13", PeriodCardState> = {
      M11: "ok",
      M12: "ok",
      M13: "ok",
    };

    const applyMetaState = (
      key: "M11" | "M12" | "M13",
      stateKey: "wtd" | "mtd" | "ytd",
    ) => {
      const state = periodStatusMap?.[stateKey];
      if (!state) return;
      if (state === "missing") {
        map[key] = "missing";
      } else if (state === "degraded") {
        map[key] = "degraded";
      } else if (state === "partial") {
        map[key] = "partial";
      } else {
        map[key] = "ok";
      }
    };

    applyMetaState("M11", "wtd");
    applyMetaState("M12", "mtd");
    applyMetaState("M13", "ytd");

    if (periodStatus === "missing") {
      map.M11 = "missing";
      map.M12 = "missing";
      map.M13 = "missing";
      return map;
    }

    if (periodStatus === "ignored") {
      map.M11 = "ignored";
      map.M12 = "ignored";
      map.M13 = "ignored";
      return map;
    }

    if (periodStatus === "degraded") {
      const hasSpecificFlags =
        (degraded?.wtd ?? false) ||
        (degraded?.mtd ?? false) ||
        (degraded?.ytd ?? false);
      if (!degraded || !hasSpecificFlags) {
        map.M11 = "degraded";
        map.M12 = "degraded";
        map.M13 = "degraded";
      } else {
        map.M11 = degraded.wtd ? "degraded" : map.M11;
        map.M12 = degraded.mtd ? "degraded" : map.M12;
        map.M13 = degraded.ytd ? "degraded" : map.M13;
      }
    } else if (degraded) {
      if (degraded.wtd && map.M11 === "ok") map.M11 = "degraded";
      if (degraded.mtd && map.M12 === "ok") map.M12 = "degraded";
      if (degraded.ytd && map.M13 === "ok") map.M13 = "degraded";
    }

    return map;
  }, [periodHealth, periodMeta, periodStatus, periodStatusMap]);

  const periodValues = useMemo(() => {
    const safeNum = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) ? n : undefined;

    return {
      M11: { value: safeNum(metrics?.M11), picked: "metrics.M11" },
      M12: { value: safeNum(metrics?.M12), picked: "metrics.M12" },
      M13: { value: safeNum(metrics?.M13), picked: "metrics.M13" },
    } as const;
  }, [metrics]);

  const windowKeyMap: Record<"M11" | "M12" | "M13", "wtd" | "mtd" | "ytd"> = {
    M11: "wtd",
    M12: "mtd",
    M13: "ytd",
  };

  // 卡片渲染时统一读取 periodValues.*.value，缺失时占位 0

  useEffect(() => {
    if (!debugEnabled) return;
    if (!rawMetrics) return;
    const payload = {
      WTD: periodValues.M11,
      MTD: periodValues.M12,
      YTD: periodValues.M13,
    };
    // eslint-disable-next-line no-console
    console.log("PERIOD-CARDS (final source)", payload);
  }, [debugEnabled, periodValues, rawMetrics]);

  const [selfCheckMessage, setSelfCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    const m11 = periodValues.M11.value;
    const m12 = periodValues.M12.value;
    const m13 = periodValues.M13.value;

    if (
      m11 !== undefined &&
      m12 !== undefined &&
      m13 !== undefined &&
      m11 === m12 &&
      m12 === m13 &&
      periodStatus === "ok"
    ) {
      setSelfCheckMessage("检测到 WTD/MTD/YTD 数值完全一致，请核对原始数据是否异常。");
    } else {
      setSelfCheckMessage(null);
    }
  }, [periodStatus, periodValues]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const usp = new URLSearchParams(window.location.search);
    if (usp.get("debugM11") !== "1") return;

    try {
      const ssr = JSON.parse(
        document.getElementById("__NEXT_DATA__")?.textContent || "{}",
      );
      const ssrMetrics =
        ssr?.props?.pageProps?.metrics ?? ssr?.props?.pageProps?.data?.metrics;
      // eslint-disable-next-line no-console
      console.log(
        "SSR has metrics?",
        !!ssrMetrics,
        ssrMetrics ? Object.keys(ssrMetrics) : null,
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log("SSR metrics inspect failed:", e);
    }

    const rawAny = rawMetrics as any;

    // eslint-disable-next-line no-console
    console.log("PERIOD-CARDS (final source)", {
      WTD: periodValues.M11,
      MTD: periodValues.M12,
      YTD: periodValues.M13,
    });
    // eslint-disable-next-line no-console
    console.log("COMPARE raw alias vs Mxx:", {
      M11: metrics?.M11,
      M12: metrics?.M12,
      M13: metrics?.M13,
      raw_WTD: rawAny?.WTD ?? rawAny?.wtd,
      raw_MTD: rawAny?.MTD ?? rawAny?.mtd,
      raw_YTD: rawAny?.YTD ?? rawAny?.ytd,
    });

    let tries = 0;
    const maxTries = 20;
    const timer = setInterval(() => {
      tries += 1;
      const detail = getLastWtdMtdYtdExplain();
      if (detail) {
        // eslint-disable-next-line no-console
        console.log("[M11/M12/M13 debug]", detail);
        if (typeof console.table === "function") {
          // eslint-disable-next-line no-console
          console.table(detail.ranges.week.rows);
          // eslint-disable-next-line no-console
          console.table(detail.ranges.month.rows);
          // eslint-disable-next-line no-console
          console.table(detail.ranges.year.rows);
        }
        clearInterval(timer);
      } else if (tries >= maxTries) {
        // eslint-disable-next-line no-console
        console.warn(
          "debugM11: no explain captured (did metrics compute on client?)",
        );
        clearInterval(timer);
      }
    }, 300);

    return () => clearInterval(timer);
  }, [metrics, periodValues, rawMetrics]);

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
          ? periodValues.M11.value
          : key === "M12"
          ? periodValues.M12.value
          : key === "M13"
          ? periodValues.M13.value
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
            ? (value as { total: number } | undefined)?.total
            : (value as number | undefined);
        let numericForColor: number | undefined;

        if (key === "M11" || key === "M12" || key === "M13") {
          const state = periodCardStates[key];
          const breakdown = periodBreakdown?.[windowKeyMap[key]];

          if (state === "partial") {
            const realizedValue =
              typeof breakdown?.realized === "number"
                ? breakdown.realized
                : numValue;
            if (realizedValue === undefined) {
              formattedValue = (
                <span className="text-muted-foreground font-medium">待补充</span>
              );
            } else {
              formattedValue = (
                <span className="inline-flex items-center gap-2">
                  <span>{formatCurrency(realizedValue)}</span>
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                    ΔU 待补充
                  </span>
                </span>
              );
              numericForColor = realizedValue;
            }
          } else if (state === "missing") {
            formattedValue = (
              <span className="text-amber-600 font-semibold">数据缺失</span>
            );
          } else if (numValue === undefined) {
            formattedValue = (
              <span className="text-muted-foreground font-medium">待补充</span>
            );
          } else if (state !== "ok") {
            formattedValue = (
              <span className="text-muted-foreground font-medium">待补充</span>
            );
          } else {
            formattedValue = formatCurrency(numValue);
            numericForColor = numValue;
          }
        } else if (numValue === undefined || Number.isNaN(numValue)) {
          formattedValue = (
            <span className="text-muted-foreground font-medium">待补充</span>
          );
        } else {
          formattedValue = formatCurrency(numValue);
          numericForColor = numValue;
        }

        // 设置颜色
        if (
          ["M1", "M2", "M3", "M4", "M6", "M9", "M11", "M12", "M13"].includes(
            key,
          )
        ) {
          if (key === "M11" || key === "M12" || key === "M13") {
            colorClass =
              periodCardStates[key] === "ok" && numericForColor !== undefined
                ? numericForColor > 0
                  ? "green"
                  : numericForColor < 0
                  ? "red"
                  : ""
                : "";
          } else {
            colorClass =
              numericForColor !== undefined
                ? numericForColor > 0
                  ? "green"
                  : numericForColor < 0
                  ? "red"
                  : ""
                : "";
          }
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
  }, [metrics, metricNames, order, periodCardStates, periodValues]);

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

  const degradedKeys = useMemo(
    () =>
      (["M11", "M12", "M13"] as const).filter(
        (key) => periodCardStates[key] === "degraded",
      ),
    [periodCardStates],
  );

  const issues = periodHealth?.issues ?? [];
  const partialIssues = issues.filter(
    (issue) => issue.kind === "BASELINE_DELTA_MISSING",
  );
  const blockingIssues = issues.filter(
    (issue) => issue.kind !== "BASELINE_DELTA_MISSING",
  );

  const hasMissingOrIgnored =
    periodStatus === "missing" || periodStatus === "ignored";
  const shouldShowMissingSummary =
    hasMissingOrIgnored && periodHealth?.origin !== "missing-close-banner";
  const shouldShowPeriodSummary =
    shouldShowMissingSummary ||
    degradedKeys.length > 0 ||
    issues.length > 0 ||
    periodStatus === "partial";

  const summaryMessages = useMemo(() => {
    const messages: string[] = [];
    if (periodHealth?.summaries?.length) {
      for (const summary of periodHealth.summaries) {
        const details = summary.symbols
          .map((detail) => {
            const labels = detail.fallbacks
              .map((fb) => FALLBACK_LABELS[fb] ?? fb)
              .filter(Boolean);
            const suffix = labels.length > 0 ? `（${labels.join("、")}）` : "";
            return `${detail.symbol}${suffix}`;
          })
          .join("、");
        messages.push(`${summary.date}：${details}`);
      }
    }
    if (periodHealth?.issues?.length) {
      for (const issue of periodHealth.issues) {
        if (issue?.message) messages.push(issue.message);
      }
    }
    return messages;
  }, [periodHealth?.issues, periodHealth?.summaries]);

  const summaryIntroParts: string[] = [];
  if (periodStatus === "missing") {
    summaryIntroParts.push("缺少必要收盘价数据");
  }
  if (periodStatus === "ignored") {
    summaryIntroParts.push("存在缺失数据已被忽略");
  }
  if (
    blockingIssues.length > 0 &&
    (periodStatus === "missing" || periodStatus === "degraded")
  ) {
    summaryIntroParts.push("检测到其它关键数据缺失");
  }
  const periodLabelMap: Record<"M11" | "M12" | "M13", string> = {
    M11: "WTD",
    M12: "MTD",
    M13: "YTD",
  };
  if (degradedKeys.length > 0) {
    summaryIntroParts.push(
      `指标退化：${degradedKeys.map((key) => periodLabelMap[key]).join("、")}`,
    );
  }
  const partialWindows = (Object.entries(periodStatusMap ?? {})
    .filter(([, state]) => state === "partial")
    .map(([window]) => window) as Array<"wtd" | "mtd" | "ytd">).map(
    (windowKey) =>
      windowKey === "wtd" ? "WTD" : windowKey === "mtd" ? "MTD" : "YTD",
  );
  if (partialWindows.length > 0) {
    summaryIntroParts.push(`ΔU 待补充：${partialWindows.join("、")}`);
  } else if (periodStatus === "partial" || partialIssues.length > 0) {
    summaryIntroParts.push("ΔU 待补充");
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
        {selfCheckMessage && (
          <div
            className="w-full max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700"
            data-testid="period-self-check"
          >
            {selfCheckMessage}
          </div>
        )}
        {shouldShowPeriodSummary && (
          <div
            className={
              periodStatus === "partial"
                ? "w-full max-w-3xl rounded-md border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700"
                : "w-full max-w-3xl rounded-md border border-amber-200 bg-amber-100/70 p-3 text-sm text-amber-900"
            }
            data-testid="period-health-summary"
          >
            <div className="font-medium">
              指标异常提醒
              {summaryIntroParts.length > 0
                ? `（${summaryIntroParts.join("；")}）`
                : ""}
            </div>
            {summaryMessages.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {summaryMessages.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2">
                请检查 close_prices 数据源，补充缺失的收盘价或确认兜底策略。
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
