import { explainWtdMtdYtdFromSnapshots } from "@/app/lib/metrics";
import type { DailyResult } from "@/app/lib/types";
import type { Position, Trade } from "@/lib/services/dataService";
import type { MetricsContract } from "@/app/lib/types/metrics";
import type { PeriodHealthIssue } from "@/app/lib/types/health";
import { ymdInNY } from "@/lib/timezone";

interface CollectIssuesOptions {
  evalDate: string;
  dailyResults: DailyResult[];
  trades: Trade[];
  positions: Position[];
  metrics: MetricsContract | null | undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDay = (input: string | undefined): string => {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }
  const source = DATE_RE.test(input) ? `${input}T12:00:00Z` : input;
  const ny = ymdInNY(source);
  return DATE_RE.test(ny) ? ny : "";
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const pushUnique = (
  list: PeriodHealthIssue[],
  issue: PeriodHealthIssue,
) => {
  if (!issue.message) return;
  const duplicate = list.some(
    (existing) =>
      existing.kind === issue.kind && existing.message === issue.message,
  );
  if (!duplicate) {
    list.push(issue);
  }
};

function diagnoseSnapshots(
  issues: PeriodHealthIssue[],
  evalDay: string,
  dailyResults: DailyResult[],
  positions: Position[],
) {
  const rowsByDay = new Map<string, DailyResult>();
  for (const row of dailyResults ?? []) {
    if (!row) continue;
    const day = toDay(row.date);
    if (!day) continue;
    rowsByDay.set(day, row);
    const missingBaselineSymbols = Array.isArray(
      (row as unknown as { missingBaselineSymbols?: unknown[] })
        ?.missingBaselineSymbols,
    )
      ? (
          (row as unknown as { missingBaselineSymbols?: unknown[] })
            ?.missingBaselineSymbols || []
        )
          .map((sym) =>
            typeof sym === "string" ? sym.trim().toUpperCase() : null,
          )
          .filter((sym): sym is string => Boolean(sym))
      : [];

    const allowUnrealizedMissing = missingBaselineSymbols.length > 0;

    if (
      !isFiniteNumber(row.realized) ||
      (!allowUnrealizedMissing && !isFiniteNumber(row.unrealized)) ||
      (row.unrealizedDelta !== undefined &&
        !isFiniteNumber(row.unrealizedDelta))
    ) {
      pushUnique(issues, {
        kind: "SNAPSHOT_VALUE_INVALID",
        message: `${day} 的快照包含非法数值，请补充原始数据。`,
      });
    }
  }

  const hasCompleteRow = (day: string) => {
    if (!day) return false;
    const row = rowsByDay.get(day);
    if (!row) return false;
    if (!isFiniteNumber(row.realized) || !isFiniteNumber(row.unrealized)) {
      return false;
    }
    if (
      row.unrealizedDelta !== undefined &&
      !isFiniteNumber(row.unrealizedDelta)
    ) {
      return false;
    }
    return true;
  };

  if (!hasCompleteRow(evalDay)) {
    pushUnique(issues, {
      kind: "MISSING_SNAPSHOT",
      message: `评估日 ${evalDay} 的快照缺失或数值无效，周期统计无法保证正确性。`,
    });
  }

  try {
    const explain = explainWtdMtdYtdFromSnapshots(dailyResults, evalDay);
    const firstActive = explain.firstActiveDate;

    const fallbackSymbols = Array.from(
      new Set(
        positions
          .map((pos) => (pos?.symbol ?? "").trim().toUpperCase())
          .filter((sym): sym is string => Boolean(sym)),
      ),
    );

    const baselineEntries: Array<{
      key: "week" | "month" | "year";
      label: string;
    }> = [
      { key: "week", label: "周度基线" },
      { key: "month", label: "月度基线" },
      { key: "year", label: "年度基线" },
    ];

    for (const entry of baselineEntries) {
      const baseline = explain.baseline?.[entry.key];
      if (!baseline) continue;
      const baselineDate = baseline.baselineDate;
      if (!baselineDate) continue;
      if (firstActive && baselineDate < firstActive) continue;

      if (baseline.baselineMode === "missing") {
        if (!hasCompleteRow(baselineDate)) {
          pushUnique(issues, {
            kind: "MISSING_BASELINE",
            message: `${entry.label}（${baselineDate}）缺少可用快照，相关周期指标可能退化。`,
          });
        }
        continue;
      }

      if (baseline.baselineMode === "partial") {
        const symbols = baseline.missingBaselineSymbols?.length
          ? baseline.missingBaselineSymbols
          : fallbackSymbols;
        const suffix = symbols.length > 0 ? `, ${symbols.join("、")}` : "";
        pushUnique(issues, {
          kind: "BASELINE_DELTA_MISSING",
          message: `ΔU 缺基线价（${baselineDate}${suffix}）`,
        });
      }
    }
  } catch {
    // 调试辅助失败时忽略
  }
}

function diagnoseRecords(
  issues: PeriodHealthIssue[],
  trades: Trade[],
  positions: Position[],
) {
  for (const trade of trades ?? []) {
    if (!trade) continue;
    const qty = Number(trade.quantity);
    const price = Number(trade.price);
    if (!isFiniteNumber(qty) || !isFiniteNumber(price)) {
      const date = toDay(trade.date) || trade.date || "未知日期";
      const symbol = trade.symbol || "未知标的";
      pushUnique(issues, {
        kind: "INVALID_RECORD",
        message: `交易 ${symbol}（${date}）的数量或价格缺失，已从计算中排除。`,
      });
    }
  }

  for (const pos of positions ?? []) {
    if (!pos) continue;
    if (!isFiniteNumber(pos.qty) || !isFiniteNumber(pos.avgPrice)) {
      const symbol = pos.symbol || "未知标的";
      pushUnique(issues, {
        kind: "INVALID_RECORD",
        message: `持仓 ${symbol} 的数量或成本无效，请检查导入数据。`,
      });
    }
  }
}

function diagnoseMetrics(
  issues: PeriodHealthIssue[],
  metrics: MetricsContract | null | undefined,
) {
  if (!metrics) {
    pushUnique(issues, {
      kind: "PERIOD_VALUE_MISSING",
      message: "未能生成任何周期指标，请确认输入数据是否完整。",
    });
    return;
  }

  const periodEntries: Array<{
    key: "M11" | "M12" | "M13";
    label: string;
    value: unknown;
  }> = [
    { key: "M11", label: "WTD", value: metrics.M11 },
    { key: "M12", label: "MTD", value: metrics.M12 },
    { key: "M13", label: "YTD", value: metrics.M13 },
  ];

  periodEntries.forEach(({ label, value }) => {
    if (!isFiniteNumber(value)) {
      pushUnique(issues, {
        kind: "PERIOD_VALUE_MISSING",
        message: `${label} 指标缺失或无效，请检查所需快照是否完整。`,
      });
    }
  });

  const missingPrev = metrics.aux?.missingPrevCloseSymbols ?? [];
  if (missingPrev.length > 0) {
    pushUnique(issues, {
      kind: "MISSING_PREV_CLOSE",
      message: `以下标的缺少昨日收盘价：${missingPrev.join("、")}`,
    });
  }

  const excluded = metrics.aux?.m6Excluded ?? [];
  const excludedSymbols = excluded
    .filter((row) =>
      row?.reason === "MISSING_PREV_CLOSE" || row?.reason === "MISSING_MARK",
    )
    .map((row) => row.symbol)
    .filter((symbol): symbol is string => typeof symbol === "string");
  if (excludedSymbols.length > 0) {
    pushUnique(issues, {
      kind: "M6_WARNING",
      message: `以下标的因行情缺失未计入 MTM：${excludedSymbols.join("、")}`,
    });
  }

  const warnings = Array.isArray(metrics._m6?.warnings)
    ? metrics._m6.warnings
    : [];
  const missingWarnings = warnings.filter((msg) =>
    typeof msg === "string" && /缺失|missing/i.test(msg),
  );
  if (missingWarnings.length > 0) {
    pushUnique(issues, {
      kind: "M6_WARNING",
      message: `M6 计算警告：${missingWarnings.join("；")}`,
    });
  }
}

export function collectPeriodHealthIssues({
  evalDate,
  dailyResults,
  trades,
  positions,
  metrics,
}: CollectIssuesOptions): PeriodHealthIssue[] {
  const issues: PeriodHealthIssue[] = [];
  const evalDay = toDay(evalDate) || toDay(dailyResults?.[dailyResults.length - 1]?.date);

  if (!evalDay) {
    pushUnique(issues, {
      kind: "MISSING_SNAPSHOT",
      message: "无法确定评估日，周期指标已暂停计算。",
    });
  } else {
    diagnoseSnapshots(issues, evalDay, dailyResults, positions);
  }

  diagnoseRecords(issues, trades, positions);
  diagnoseMetrics(issues, metrics);

  return issues;
}
