"use client";

import { useTradingDay } from "../lib/TradingDayContext";
import { resolveTradingDayStr } from "../lib/nyDay";
import type { EnrichedTrade } from "@/lib/fifo";
import type { Position } from "@/lib/services/dataService";
import { useStore } from "@/lib/store";
import {
  formatCurrency,
  normalizeMetrics,
  isDebug,
  getLastWtdMtdYtdExplain,
  STALE_BASELINE_BDAYS,
} from "@/app/lib/metrics";
import { selectM4TodaySummary } from "@/app/lib/m4Today";
import type {
  MetricsContract,
  PeriodBaselineMeta,
  PeriodDegradationReason,
  PeriodParseError,
} from "@/app/lib/types/metrics";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import StatusBadge from "@/components/StatusBadge";
import WarnChip from "@/components/common/WarnChip";
import { useGlobalMeta } from "@/app/state/globalModeStore";
import { parseSnapshotNumber } from "@/app/lib/snapshotNumber";
import {
  getPeriodOfficialCloseSummary,
  formatOfficialCloseEntries,
  formatPendingSummary,
} from "@/app/lib/periodOfficialClose";

const fmtMoney = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      })
    : "-";
const formatNYShort = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        hour12: false,
        timeZone: "America/New_York",
      })
    : "-";

const DEGRADE_REASON_LABELS: Record<PeriodDegradationReason, string> = {
  DEGEN_NO_BASELINE: "缺基线",
  DEGEN_STALE_BASELINE: "基线过旧",
  DEGEN_WINDOW_EMPTY: "窗口空",
  DEGEN_PARSE_FAILED: "解析失败",
};

function summarizeParseErrors(parseErrors?: PeriodParseError[]): string[] {
  if (!parseErrors || parseErrors.length === 0) {
    return [];
  }

  const grouped = new Map<string, { count: number; samples: string[] }>();
  for (const err of parseErrors) {
    if (!err || err.field === undefined) continue;
    const key = String(err.field);
    const bucket = grouped.get(key) ?? { count: 0, samples: [] };
    bucket.count += 1;
    if (bucket.samples.length < 2) {
      const rawValue =
        err.trimmed !== undefined
          ? err.trimmed
          : err.value === null
          ? "null"
          : err.value === undefined
          ? "undefined"
          : typeof err.value === "object"
          ? JSON.stringify(err.value)
          : String(err.value);
      const sample = rawValue === "" ? "(空字符串)" : rawValue;
      const day = err.day ? `${err.day}→` : "";
      bucket.samples.push(`${day}${sample}`);
    }
    grouped.set(key, bucket);
  }

  return Array.from(grouped.entries()).map(([field, info]) => {
    const samples = info.samples.join("，");
    return `${field}：${info.count} 条${samples ? `（示例 ${samples}）` : ""}`;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isPeriodParseErrorLike(value: unknown): value is PeriodParseError {
  return isRecord(value) && "field" in value;
}

function composeDegradeTooltip(
  label: string,
  reason?: PeriodDegradationReason,
  baselineMeta?: PeriodBaselineMeta,
  parseErrors?: PeriodParseError[],
  extraLines: string[] = [],
): string {
  const lines: string[] = [];
  const reasonLine = reason ? `${label}（${reason}）` : label;
  lines.push(`退化原因：${reasonLine}`);

  if (baselineMeta?.baselineYmd) {
    lines.push(`基线日期：${baselineMeta.baselineYmd}`);
  }

  const distance =
    baselineMeta &&
    typeof baselineMeta.distanceBusinessDays === "number" &&
    Number.isFinite(baselineMeta.distanceBusinessDays)
      ? baselineMeta.distanceBusinessDays
      : undefined;

  const threshold =
    baselineMeta &&
    typeof baselineMeta.thresholdBusinessDays === "number" &&
    Number.isFinite(baselineMeta.thresholdBusinessDays)
      ? baselineMeta.thresholdBusinessDays
      : undefined;

  if (distance !== undefined) {
    if (reason === "DEGEN_STALE_BASELINE") {
      const displayThreshold = threshold ?? STALE_BASELINE_BDAYS;
      lines.push(`距评估日 ${distance} 个交易日（阈值 ${displayThreshold}）`);
    } else {
      lines.push(`距评估日 ${distance} 个交易日`);
    }
  } else if (reason === "DEGEN_STALE_BASELINE") {
    const displayThreshold = threshold ?? STALE_BASELINE_BDAYS;
    lines.push(`基线已超过阈值 ${displayThreshold} 个交易日`);
  }

  const parseSummaries = summarizeParseErrors(parseErrors);
  if (parseSummaries.length > 0) {
    lines.push(`解析失败：${parseSummaries.join("；")}`);
  }

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  return lines.join("\n");
}

const WINDOW_KEY_MAP: Record<"M11" | "M12" | "M13", "wtd" | "mtd" | "ytd"> = {
  M11: "wtd",
  M12: "mtd",
  M13: "ytd",
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
  badge,
  children,
}: {
  title: ReactNode;
  value?: ReactNode;
  colorClass?: string;
  dataTestId?: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="box" data-testid={dataTestId}>
      {badge}
      <div className="title flex items-start justify-between gap-2">
        <div className="flex-1">{title}</div>
      </div>
      {children ?? (
        <div className={`value ${colorClass || ""}`}>{value}</div>
      )}
    </div>
  );
}

/**
 * 交易指标仪表盘组件
 * 显示所有交易系统指标的卡片视图
 */
export function DashboardMetrics({ enrichedTrades, positions }: Props) {
  void enrichedTrades;
  void positions;
  // 从全局状态获取指标
  const rawMetrics = useStore((state) => state.metrics);
  const periodHealth = useStore((state) => state.periodHealth);
  const metrics = normalizeMetrics(rawMetrics);
  const globalMeta = useGlobalMeta();
  const tradingDayAuthority = useTradingDay();
  const tradingDayFallback = useMemo(() => tradingDayAuthority || resolveTradingDayStr(), [tradingDayAuthority]);
  const debugEnabled =
    isDebug() || process.env.NEXT_PUBLIC_METRICS_DEBUG === "1";

  const periodStatus = periodHealth?.status ?? "ok";

  const periodMeta = rawMetrics?._period;
  const periodStatusMap = periodMeta?.status;
  const periodBreakdown = periodMeta?.breakdown;
  const officialCloseSummary = useMemo(
    () => getPeriodOfficialCloseSummary(metrics ?? null),
    [metrics],
  );

  const m123 = metrics?.M123 ?? null;
  const m6Card = useMemo(() => {
    if (!metrics) {
      return null;
    }

    const normalizeNumber = (value: unknown): number | undefined => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
      }
      return Object.is(value, -0) ? 0 : value;
    };

    const normalizedM6 = metrics._m6 ?? null;
    const rawM6 = rawMetrics?._m6 ?? null;
    const diagnosticsRoot = rawMetrics?._period?.diagnostics;
    const intradayDiagnosticsRaw =
      diagnosticsRoot && "intraday" in diagnosticsRoot
        ? (diagnosticsRoot as Record<string, unknown>).intraday
        : undefined;
    const intradayDiagnostics = isRecord(intradayDiagnosticsRaw)
      ? intradayDiagnosticsRaw
      : undefined;
    const intradayReason: PeriodDegradationReason | undefined =
      intradayDiagnostics &&
      typeof intradayDiagnostics.reason === "string"
        ? (intradayDiagnostics.reason as PeriodDegradationReason)
        : undefined;
    const intradayParseErrors = Array.isArray(intradayDiagnostics?.parseErrors)
      ? intradayDiagnostics.parseErrors.filter(isPeriodParseErrorLike)
      : [];
    const rawMetricsRecord = isRecord(rawMetrics)
      ? (rawMetrics as Record<string, unknown>)
      : null;
    let rawTradingDate: string | undefined;
    if (
      rawMetricsRecord &&
      typeof rawMetricsRecord.tradingDateStr === "string"
    ) {
      rawTradingDate = rawMetricsRecord.tradingDateStr as string;
    } else {
      rawTradingDate = undefined;
    }
    const diagnosticsTradeDay =
      intradayDiagnostics &&
      typeof intradayDiagnostics.uiTradeDayYmd === "string"
        ? intradayDiagnostics.uiTradeDayYmd
        : undefined;
    const tradingDay: string | undefined =
      tradingDayFallback ?? diagnosticsTradeDay ?? rawTradingDate;

    const componentFieldMap = {
      realizedToday: "realized_today",
      mtmOvernight: "mtm_overnight",
      mtmIntradayOpen: "mtm_intraday_open",
    } as const;

    type ComponentKey = keyof typeof componentFieldMap;

    const hasRawBreakdown =
      rawM6 &&
      (Object.prototype.hasOwnProperty.call(rawM6, "realizedToday") ||
        Object.prototype.hasOwnProperty.call(rawM6, "mtmOvernight") ||
        Object.prototype.hasOwnProperty.call(rawM6, "mtmIntradayOpen"));

    const componentDetails = (Object.keys(componentFieldMap) as ComponentKey[]).map(
      (key) => {
        const normalizedValue = normalizeNumber(normalizedM6?.[key]) ?? 0;
        const rawHasValue = rawM6
          ? Object.prototype.hasOwnProperty.call(rawM6, key)
          : false;
        let derivedParseError: PeriodParseError | null = null;
        if (rawHasValue) {
          const parsed = parseSnapshotNumber(rawM6?.[key]);
          if (!parsed.ok) {
            derivedParseError = {
              ...parsed.error,
              field: componentFieldMap[key],
              day: tradingDay ?? "数据缺失",
            };
          }
        }
        return {
          key,
          label:
            key === "realizedToday"
              ? "已实现盈亏"
              : key === "mtmOvernight"
              ? "隔夜 MTM"
              : "日内 MTM",
          field: componentFieldMap[key],
          value: normalizedValue,
          rawHasValue,
          parseError: derivedParseError,
        };
      },
    );

    const derivedParseErrors = componentDetails
      .map((item) => item.parseError)
      .filter((err): err is PeriodParseError => !!err);

    const parseErrorsMap = new Map<string, PeriodParseError>();
    for (const err of [...intradayParseErrors, ...derivedParseErrors]) {
      if (!err) continue;
      const key = `${err.field}|${err.day}|${err.trimmed ?? ""}|${String(
        err.value,
      )}`;
      if (!parseErrorsMap.has(key)) {
        parseErrorsMap.set(key, err);
      }
    }
    const parseErrors = Array.from(parseErrorsMap.values());

    const componentsSum = componentDetails.reduce(
      (sum, item) => sum + (item.value ?? 0),
      0,
    );
    const total = normalizeNumber(componentsSum) ?? 0;
    const rawTotal = normalizeNumber(metrics.M6?.total);
    const totalMismatch =
      rawTotal !== undefined && Math.abs(rawTotal - total) > 0.01;

    const warnings = Array.isArray(normalizedM6?.warnings)
      ? normalizedM6!.warnings.filter((msg) => typeof msg === "string" && msg)
      : [];

    const hasAlerts =
      Boolean(intradayReason) || warnings.length > 0 || parseErrors.length > 0 || totalMismatch;

    const tooltipLines: string[] = [];
    if (!hasRawBreakdown) {
      tooltipLines.push("无当日快照");
      tooltipLines.push("纽约日口径（America/New_York），20:00–23:59 ET 仍计入当日。");
    } else {
      tooltipLines.push(
        "纽约日口径（America/New_York），20:00–23:59 ET 仍计入当日。",
      );
      for (const item of componentDetails) {
        tooltipLines.push(
          `${item.label}（${item.field}）：${formatCurrency(item.value ?? 0)}`,
        );
      }
      tooltipLines.push(`合计：${formatCurrency(total)}`);

      const alertLines: string[] = [];
      if (intradayReason) {
        const label = DEGRADE_REASON_LABELS[intradayReason];
        const reasonLabel = label
          ? `${label}（${intradayReason}）`
          : intradayReason;
        alertLines.push(`⚠️ 退化原因：${reasonLabel}`);
      }
      if (warnings.length > 0) {
        for (const warning of warnings) {
          alertLines.push(`⚠️ ${warning}`);
        }
      }
      const parseSummaries = summarizeParseErrors(parseErrors);
      if (parseSummaries.length > 0) {
        alertLines.push(`⚠️ 解析失败：${parseSummaries.join("；")}`);
      }
      if (totalMismatch && rawTotal !== undefined) {
        alertLines.push(
          `⚠️ 合计校验：拆解=${formatCurrency(total)}，原值=${formatCurrency(rawTotal)}`,
        );
      }
      if (alertLines.length > 0) {
        tooltipLines.push("", ...alertLines);
      }
    }

    return {
      status: hasRawBreakdown ? "ok" : "missing",
      total,
      tooltip: tooltipLines.join("\n"),
      hasAlerts,
    } as const;
  }, [metrics, rawMetrics, tradingDayFallback]);

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

  // 卡片渲染时统一读取 periodValues.*.value，缺失时占位 0

  useEffect(() => {
    if (!debugEnabled) return;
    if (!rawMetrics) return;
    const payload = {
      WTD: periodValues.M11,
      MTD: periodValues.M12,
      YTD: periodValues.M13,
    };
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
      console.log(
        "SSR has metrics?",
        !!ssrMetrics,
        ssrMetrics ? Object.keys(ssrMetrics) : null,
      );
    } catch (e) {
      console.log("SSR metrics inspect failed:", e);
    }

    const rawRecord = isRecord(rawMetrics) ? rawMetrics : null;

    console.log("PERIOD-CARDS (final source)", {
      WTD: periodValues.M11,
      MTD: periodValues.M12,
      YTD: periodValues.M13,
    });
    console.log("COMPARE raw alias vs Mxx:", {
      M11: metrics?.M11,
      M12: metrics?.M12,
      M13: metrics?.M13,
      raw_WTD:
        (rawRecord && typeof rawRecord.WTD === "number"
          ? rawRecord.WTD
          : typeof rawRecord?.wtd === "number"
          ? rawRecord?.wtd
          : undefined),
      raw_MTD:
        (rawRecord && typeof rawRecord.MTD === "number"
          ? rawRecord.MTD
          : typeof rawRecord?.mtd === "number"
          ? rawRecord?.mtd
          : undefined),
      raw_YTD:
        (rawRecord && typeof rawRecord.YTD === "number"
          ? rawRecord.YTD
          : typeof rawRecord?.ytd === "number"
          ? rawRecord?.ytd
          : undefined),
    });

    let tries = 0;
    const maxTries = 20;
    const timer = setInterval(() => {
      tries += 1;
      const detail = getLastWtdMtdYtdExplain();
        if (detail) {
          console.log("[M11/M12/M13 debug]", detail);
          if (typeof console.table === "function") {
            console.table(detail.ranges.week.rows);
            console.table(detail.ranges.month.rows);
            console.table(detail.ranges.year.rows);
          }
          clearInterval(timer);
        } else if (tries >= maxTries) {
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
    const diagnostics = rawMetrics?._period?.diagnostics;
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
      let badgeNode: ReactNode | undefined;
      const dataTestId =
        key === "M11"
          ? "metric-wtd"
          : key === "M12"
          ? "metric-mtd"
          : key === "M13"
          ? "metric-ytd"
          : key === "M6"
          ? "metric-m6"
          : undefined;
      const baseTitle = metricNames[key] ?? key;
      let baseTitleContent: ReactNode = baseTitle;
      let titleNode: ReactNode = baseTitleContent;

      let numericForColor: number | undefined;

      // 根据不同指标类型格式化值
      if (key === "M4") {
        const summary = selectM4TodaySummary(metrics ?? null);
        const totalValue = summary.total;
        formattedValue = formatCurrency(totalValue);
        numericForColor = totalValue;
        if (summary.degraded) {
          const tooltip = summary.tooltip ?? "因缺官方昨收，过夜=0，M4为退化值";
          titleNode = (
            <span className="inline-flex items-center gap-2">
              <span>{baseTitle}</span>
              <span
                title={tooltip}
                style={{
                  backgroundColor: "#f59e0b",
                  borderRadius: "9999px",
                  display: "inline-flex",
                  height: "8px",
                  width: "8px",
                }}
              />
            </span>
          );
        }
      } else if (key === "M5") {
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
      } else if (key === "M3") {
        const m3 = metrics.M3;
        formattedValue = formatCurrency(m3.dir);
        numericForColor = m3.dir;
        badgeNode = (
          <StatusBadge meta={globalMeta ?? undefined} variant="ripple" />
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
      } else if (key !== "M6") {
        const numValue =
          value as number | undefined;

        if (key === "M11" || key === "M12" || key === "M13") {
          const state = periodCardStates[key];
          const breakdown = periodBreakdown?.[WINDOW_KEY_MAP[key]];

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

      if (key === "M6") {
        const card = m6Card;
        const total = card?.total ?? 0;
        const status = card?.status ?? "missing";
        const tooltip = card?.tooltip ?? "无当日快照";
        const hasAlerts = card?.hasAlerts ?? false;
        if (status === "missing") {
          formattedValue = (
            <span className="text-muted-foreground font-medium">待补充</span>
          );
        } else {
          formattedValue = formatCurrency(total);
          numericForColor = total;
        }

        if (status === "ok") {
          colorClass =
            total > 0 ? "green" : total < 0 ? "red" : "";
        }

        const buttonClassName = hasAlerts
          ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 focus:ring-offset-amber-100"
          : "inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-100";

        titleNode = (
          <span className="inline-flex items-center gap-2">
            <span>{baseTitle}</span>
            <button
              type="button"
              className={buttonClassName}
              title={tooltip}
              aria-label="当日盈亏拆解（纽约日口径）"
              data-testid="metric-m6-breakdown-trigger"
            >
              i
            </button>
          </span>
        );

        return {
          key,
          title: titleNode,
          value: formattedValue,
          colorClass,
          dataTestId,
          badge: (
            <StatusBadge meta={globalMeta ?? undefined} variant="static" />
          ),
        };
      }

      if (key === "M11" || key === "M12" || key === "M13") {
        const windowKey = WINDOW_KEY_MAP[key];
        const diag = diagnostics?.[windowKey];
        const officialWindow = officialCloseSummary[windowKey];
        const pendingSummaryText = formatPendingSummary(
          officialWindow?.pending ?? [],
        );
        if (pendingSummaryText && periodCardStates[key] !== "degraded") {
          baseTitleContent = (
            <span
              title={`等待当日官方收盘价落地：${pendingSummaryText}`}
              data-testid={`period-pending-tooltip-${key.toLowerCase()}`}
            >
              {baseTitle}
            </span>
          );
          titleNode = baseTitleContent;
        }
        if (periodCardStates[key] === "degraded" && diag?.degraded) {
          const reasonLabel =
            officialWindow?.missing.length
              ? "官方收盘价缺失"
              : diag.reason
              ? DEGRADE_REASON_LABELS[diag.reason] ?? "指标退化"
              : "指标退化";
          const officialMissingLines = formatOfficialCloseEntries(
            officialWindow?.missing ?? [],
          );
          const extraLines: string[] = [];
          if (officialMissingLines.length > 0) {
            extraLines.push("官方收盘价缺口：", ...officialMissingLines);
          }
          if (pendingSummaryText) {
            extraLines.push(`待落地：${pendingSummaryText}`);
          }
          const tooltip = composeDegradeTooltip(
            reasonLabel,
            diag.reason,
            diag.baselineMeta,
            diag.parseErrors,
            extraLines,
          );
          titleNode = (
            <span className="inline-flex items-center gap-2">
              <span>{baseTitleContent}</span>
              <span
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"
                data-testid={`period-degrade-hint-${key.toLowerCase()}`}
              >
                <span className="rounded bg-amber-100 px-1.5 py-0.5">
                  {reasonLabel}
                </span>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 focus:ring-offset-amber-100 dark:focus:ring-offset-slate-900"
                  title={tooltip}
                  aria-label={`${baseTitle}退化原因：${reasonLabel}`}
                  data-testid={`period-degrade-tooltip-${key.toLowerCase()}`}
                >
                  ?
                </button>
              </span>
            </span>
          );
        }
      }

      return {
        key,
        title: titleNode,
        value: formattedValue,
        colorClass,
        dataTestId,
        badge: badgeNode,
      };
    });
  }, [
    metrics,
    metricNames,
    order,
    periodCardStates,
    periodValues,
    periodBreakdown,
    rawMetrics?._period?.diagnostics,
    m6Card,
    officialCloseSummary,
    globalMeta,
  ]);

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

  const metricsReady = Boolean(metrics);

  return (
    <section id="stats" className="my-5" data-trading-day={tradingDayFallback}>
      {metricsReady ? (
        <div className="flex flex-col items-center gap-4">
          {rows.map((row, index) => (
            <div key={index} className={rowClassNames[index] ?? "grid gap-4"}>
              {row.map((metric) => {
                if (metric.key === "M2") {
                  return (
                    <MetricCard
                      key={metric.key}
                      title={
                        <div className="text-sm text-emerald-200/80 text-center">持仓市值</div>
                      }
                      badge={
                        <StatusBadge meta={globalMeta ?? undefined} variant="ripple" />
                      }
                    >
                      <div className="mt-2 text-center text-xl font-semibold text-emerald-300">
                        {fmtMoney(m123?.m2 ?? 0)}
                      </div>
                    </MetricCard>
                  );
                }

                if (metric.key === "M3") {
                  const tooltipText = `名义：${fmtMoney(m123?.m3?.nominal ?? 0)}\n纽约：${formatNYShort(
                    m123?.meta?.lastPriceAtNY,
                  )}${
                    m123?.meta?.staleSymbols?.length
                      ? `\n受影响：${m123.meta.staleSymbols.join(", ")}`
                      : ""
                  }`;

                  const infoChip = (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <WarnChip>
                            <span className="sr-only">更多信息</span>
                            <span aria-hidden className="font-semibold leading-none">
                              !
                            </span>
                          </WarnChip>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="center"
                          className="whitespace-pre text-xs"
                        >
                          {tooltipText}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );

                  return (
                    <div key={metric.key} className="relative">
                      <MetricCard
                        title={
                          <div className="flex items-center justify-center">
                            <span className="text-sm text-emerald-200/80">持仓浮盈</span>
                          </div>
                        }
                        badge={
                          <StatusBadge meta={globalMeta ?? undefined} variant="ripple" />
                        }
                      >
                        <div
                          className={`mt-2 text-center text-xl font-semibold ${
                            (m123?.m3?.dir ?? 0) >= 0
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {fmtMoney(m123?.m3?.dir ?? 0)}
                        </div>
                      </MetricCard>
                      <div className="absolute right-2 top-2 z-20">{infoChip}</div>
                    </div>
                  );
                }

                return (
                  <MetricCard
                    key={metric.key}
                    title={metric.title!}
                    value={metric.value}
                    colorClass={metric.colorClass}
                    dataTestId={metric.dataTestId}
                    badge={metric.badge}
                  />
                );
              })}
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
        </div>
      ) : (
        <div className="stats-grid">正在加载指标...</div>
      )}
    </section>
  );
}
