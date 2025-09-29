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
- 针对导入数据常见的千分位数字格式，统一在快照归一化与指标解析阶段清洗字符串（如 `26,030.56`），避免被误判为缺失导致
  M11/M12/M13 粘连；新增覆盖测试验证该场景。
- 调整 `deriveWindowPnl` 在缺少窗口前快照但具备 ΔU 时直接按首行推回基线，消除 M11/M12/M13 低估与粘连；补强诊断单测确保退化标记与数值吻合。
