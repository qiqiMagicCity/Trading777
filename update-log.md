# 更新日志

## 2024-05-10
- 抽取 `normalizeToNYMidday` 到 `apps/web/app/lib/time.ts` 并统一返回 `T12:00:00Z`。
- 更新 `metrics.ts`、`metrics-periods.ts` 与 `period-sum-cache.ts` 复用新 helper，消除重复代码。
- 新增 `period-boundary.tz.test.ts`，验证在非纽约时区下 `sumPeriod` 与 `computePeriods` 仍包含评估日。
- 运行新增与既有的周期相关单测，确保行为无回归。
## 2024-05-11
- 扩展 `MIDNIGHT_ISO_RE` 支持任意精度小数秒与无冒号时区偏移，确保纽约日期归一化涵盖 `.000000Z` 与 `+0000` 形式。
- 更新 `time.normalize`、`metrics-ny-date-normalization`、`calcWtdMtdYtdFromSnapshots.fix` 单测覆盖新的午夜格式，验证 `nyDateStrSafe` 与 `collectSnapshotRowsForEval` 保持正确纽约日，并确保新增快照会刷新 WTD/MTD/YTD。
