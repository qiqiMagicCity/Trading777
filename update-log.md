# 更新日志

## 2024-05-11
- 过滤 `collectSnapshotRowsForEval` 与 `normalizeDailyRows` 的空白浮盈字段，避免被误记为 0。
- 调整 `deriveWindowPnl` 退化逻辑，缺乏有效信号时改为回传 `NaN` 并新增空浮盈回归测试。

## 2024-05-10
- 抽取 `normalizeToNYMidday` 到 `apps/web/app/lib/time.ts` 并统一返回 `T12:00:00Z`。
- 更新 `metrics.ts`、`metrics-periods.ts` 与 `period-sum-cache.ts` 复用新 helper，消除重复代码。
- 新增 `period-boundary.tz.test.ts`，验证在非纽约时区下 `sumPeriod` 与 `computePeriods` 仍包含评估日。
- 运行新增与既有的周期相关单测，确保行为无回归。
