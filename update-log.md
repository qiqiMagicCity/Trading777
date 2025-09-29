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
- 修复 Vercel 构建报错：TS 根据 `MinimalDailyResult.unrealized` 的类型收窄为 `never`，导致 `trim()` 调用类型错误；改为分别处理数值与字符串分支，仅在有限值时赋回浮盈字段，构建恢复通过。
- 再次构建时仍触发同类 `trim` 类型错误，原因是 `MinimalDailyResult` 类型未纳入字符串/空值分支，编译器推断 `typeof === "string"` 永远不成立；补充联合类型允许 `string | null` 并保持数值校验，随后相关单测与 `npm run build` 均通过。

## 2025-09-30
- `calcWtdMtdYtdFromSnapshots` 在任一窗口退化时改为返回 `NaN`，避免误读为 0。
- 更新 WTD/MTD/YTD 快照单测覆盖退化返回 `NaN` 与正常路径不变。
- 回归 `normalizeMetrics` 与 `DashboardMetrics`，新增单测确认遇到 `NaN` 时 UI 落入“待补充”分支。

## 2025-10-01
- `runAll` 结果透传 `calcMetrics` 的 `_period.degraded`，并在类型层补充退化映射定义。
- `runAll.align` 单测扩展退化断言，同时新增覆盖退化传递的用例；`verify-golden` 脚本收到退化时提示“待补充”。

## 2025-10-02
- `deriveWindowPnl` 遇到仅含评估日的窗口时主动标记退化并返回 `NaN`，避免沿用旧基线。
- `calcWtdMtdYtdFromSnapshots` 单测新增 Case H，覆盖仅评估日窗口的退化行为。
