import { explainWtdMtdYtdFromSnapshots } from "@/app/lib/metrics";
import type { DailyResult } from "@/app/lib/types";
import type { Position, Trade } from "@/lib/services/dataService";
import type { MetricsContract } from "@/app/lib/types/metrics";
import type { PeriodHealthIssue, PeriodHealthIssueKind } from "@/app/lib/types/health";

interface CollectIssuesOptions {
  evalDate: string;
  dailyResults: DailyResult[];
  trades: Trade[];
  positions: Position[];
  metrics: MetricsContract | null | undefined;
}

const toDay = (input: string | undefined): string =>
  typeof input === "string" && input.length >= 10 ? input.slice(0, 10) : "";

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
) {
  const rowsByDay = new Map<string, DailyResult>();
  for (const row of dailyResults ?? []) {
    if (!row) continue;
    const day = toDay(row.date);
    if (!day) continue;
    rowsByDay.set(day, row);
    if (
      !isFiniteNumber(row.realized) ||
      !isFiniteNumber(row.unrealized) ||
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
    const rangeEntries: Array<{
      kind: PeriodHealthIssueKind;
      day: string;
      label: string;
    }> = [
      {
        kind: "MISSING_BASELINE",
        day: explain.ranges.week.start,
        label: "周度基线",
      },
      {
        kind: "MISSING_BASELINE",
        day: explain.ranges.month.start,
        label: "月度基线",
      },
      {
        kind: "MISSING_BASELINE",
        day: explain.ranges.year.start,
        label: "年度基线",
      },
    ];
    for (const entry of rangeEntries) {
      if (!entry.day) continue;
      if (!hasCompleteRow(entry.day)) {
        pushUnique(issues, {
          kind: entry.kind,
          message: `${entry.label}（${entry.day}）缺少可用快照，相关周期指标可能退化。`,
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

  const periodLabels: Record<"M11" | "M12" | "M13", string> = {
    M11: "WTD",
    M12: "MTD",
    M13: "YTD",
  };
  (Object.keys(periodLabels) as Array<"M11" | "M12" | "M13">).forEach((key) => {
    const value = (metrics as Record<string, unknown>)[key];
    if (!isFiniteNumber(value)) {
      pushUnique(issues, {
        kind: "PERIOD_VALUE_MISSING",
        message: `${periodLabels[key]} 指标缺失或无效，请检查所需快照是否完整。`,
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
    diagnoseSnapshots(issues, evalDay, dailyResults);
  }

  diagnoseRecords(issues, trades, positions);
  diagnoseMetrics(issues, metrics);

  return issues;
}
