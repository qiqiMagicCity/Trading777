# 更新日志

## 2024-05-10
- 抽取 `normalizeToNYMidday` 到 `apps/web/app/lib/time.ts` 并统一返回 `T12:00:00Z`。
- 更新 `metrics.ts`、`metrics-periods.ts` 与 `period-sum-cache.ts` 复用新 helper，消除重复代码。
- 新增 `period-boundary.tz.test.ts`，验证在非纽约时区下 `sumPeriod` 与 `computePeriods` 仍包含评估日。
- 运行新增与既有的周期相关单测，确保行为无回归。

## 2025-09-29
- 调整 `collectSnapshotRowsForEval` 忽略空白浮盈，并在缺少评估日快照时退化为 `NaN`。
- 更新 `runAll.normalizeDailyRows` 仅在裁剪后仍为有限值时保留浮盈字段。
- 新增针对空白浮盈的快照/归一化单测，覆盖退化分支与裁剪逻辑。
