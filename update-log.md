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

## 2025-10-03
- `deriveWindowPnl` 记录基线日期并校验是否与窗口首日相邻交易日，超期即标记退化并返回 `NaN`。
- 更新 `calcWtdMtdYtdFromSnapshots` 单测：新增“基线过期”案例，并调整周/月/年期望覆盖退化情境。
- `DashboardMetrics` 单测补充基线过期时应展示“待补充”的断言，确保 UI 呈现符合预期。

## 2025-10-04
- `normalizeMetrics` 在周/月/年窗口退化或指标为 `NaN` 时停止回退旧字段，避免沿用历史口径。
- 补充 `metrics-normalize-period-alias.test.ts`，覆盖退化 + `NaN` 输入时不再带出 `M11` 的断言。
- 在 `metrics.ts` 注释说明退化分支禁止回退旧字段，提示前端应展示“待补充”。

## 2025-10-05
- `normalizeMetrics` 透传 `_period` 元数据并浅拷贝退化标记，便于前端读取退化状态。
- 新增 `metrics-normalize-period-metadata.test.ts`，验证 `_period.degraded` 保留且不会与原输入共享引用。
- 检视 `runAll`、`page.tsx` 与 store 使用 `_period.degraded` 的逻辑，确认仍按退化状态渲染提示。

## 2025-10-06
- 移除 `normalizeMetrics` 对 WTD/MTD/YTD 旧别名的回退，仅保留显式 `M11/M12/M13` 选值。
- 更新周期别名单测，确保旧别名输入不会带出 `M11/M12/M13`，并维持显式字段优先级。
- 补充 `DashboardMetrics` 26030.56 退化场景回归测试，确认 UI 通过“待补充”路径提示用户。

## 2025-10-07
- 调整 `deriveWindowPnl` 基线过期判定：只要实际基线日不等于预期上一交易日，即视为退化。
- 新增 `calcWtdMtdYtdFromSnapshots` 回归用例，覆盖“窗口首日存在但基线早于上一交易日”导致的退化行为。
- 运行 `npm test -- apps/web/app/lib/__tests__/calcWtdMtdYtdFromSnapshots.fix.test.ts` 确认退化逻辑覆盖。

## 2025-10-08
- 更新 `DashboardMetrics`：去除周期指标的 `?? 0` 兜底，确保缺失值保持 `undefined` 供 UI 识别。
- 调整周期卡片渲染逻辑，缺失值时统一展示“待补充”且不再套用红绿配色，避免误判为 `$0.00`。
- 补充 `DashboardMetrics` 单测，覆盖周期指标缺失时显示占位提示的场景。

## 2025-10-09
- 修复 Vercel 构建报错：`formatCurrency` 仍按 `number` 类型要求入参，周期/常规指标去掉 `?? 0` 后传入 `undefined` 触发 TS 报错。
- 调整 `DashboardMetrics` 渲染逻辑，缺值时统一走“待补充”占位并跳过配色，仅在取得有效数值后再调用 `formatCurrency` 与判定红绿，构建恢复通过。
- 阅读 `deriveWindowPnl` 与相关单测记录，准备处理上一交易日基线退化的问题。

## 2025-10-10
- 更新 `deriveWindowPnl`：仅在窗口内仅剩评估日且无法找到窗口前的可用基线时才退化，确保带上一交易日基线的场景仍可计算。
- 新增 `Case K` 单测，覆盖上一交易日基线 + 评估日快照的场景，验证 WTD/MTD/YTD 数值正确且未标记退化。
- 回归 `calcWtdMtdYtdFromSnapshots` 与 `DashboardMetrics` 单测，确认退化分支维持预期表现。

## 2025-10-11
- 调整 `_calcM6Strict` 输出今日已实现、隔夜 MTM、日内未平 MTM 三段贡献，并返回 `realized_today`/`mtm_overnight`/`mtm_intraday_open` legs。
- `calcMetrics`、`runAll` 与 `normalizeMetrics` 同步读取新结构，`m6Legs` 记录 `basis/mark/amount` 字段并维持 M6 恒等式。
- 更新黄金案例与拆解单测，验证 MTM legs 汇总等于价格变动，realized legs 汇总等于 `_m6.realizedToday`。
- 修复 Vercel 构建报错：`Metrics._m6` 类型仍旧要求 `overnightPnL` 字段，导致 `_calcM6Strict` 输出的新结构无法赋值。现更新接口定义与调试日志字段，统一为 `realizedToday`/`mtmOvernight`/`mtmIntradayOpen`，构建恢复通过。

## 2025-10-12
- 调整 `AddTradeModal` 在提交后不再等待 `onAdded` 完成，若返回 Promise 则捕获异常记录日志，并立即关闭弹窗。
- `DashboardPage` 与 `TradesPage` 的 `onAdded` 均改为自行处理异步错误，同时新增后台刷新状态与失败提示横幅，避免依赖弹窗阻塞。
- `DashboardPage.reloadData` 失败时抛出异常，便于触发刷新错误提示。

## 2025-10-13
- `DashboardPage.reloadData` 改为优先使用 IndexedDB 与缓存价格即时刷新交易、持仓与指标，再异步刷新远程行情与收盘价。
- 新增 `refreshPricesAndMetrics`，集中处理实时行情与收盘价拉取，异常时仅回退到刷新提示而不阻塞前序缓存结果。
- 后台流程复用缺口诊断更新逻辑，并在成功时清理刷新错误提示，保持缺价横幅与退化状态及时同步。

## 2025-10-14
- `trades` API 持久化路径改为以 `process.cwd()` + `public/trades.json` 为基准，并在根目录执行时回退到 `apps/web/public`，保证不同工作目录下一致写入。
- 更新 `trades.route` 单测的路径断言以匹配新的计算逻辑，保持路径检测与生产代码一致。
- 本地运行 `npm test -w web` 并实际调用 `/api/trades`，确认写入行为与单测均按预期通过。

## 2025-10-15
- 新增 `collectPeriodHealthIssues`，统一诊断缺失快照、非法成交/持仓字段、昨收缺口与 MTM 排除标的，并在周期健康状态中记录详细问题。
- `DashboardPage` 整合数据诊断结果：缺项时即使未缺收盘价也会触发告警，忽略缺价后若仍有其它缺项将继续提示，后台刷新亦同步更新状态。
- `DashboardMetrics` 支持展示诊断信息摘要，并扩充单测覆盖缺项提示渲染，确保用户能看到所有关键缺口警示。

## 2025-10-16
- 修复 Vercel 构建报错：在 `collectPeriodHealthIssues` 中将 `metrics` 强转为 `Record<string, unknown>` 触发 TS 类型不兼容，导致 `next build` 中断。
- 改为预先列举 WTD/MTD/YTD 三个周期条目并读取 `metrics.M11/M12/M13`，既保持 `unknown` 判定，又避免不必要的强转，构建恢复通过。

## 2025-10-17
- 引入 `firstActiveDate` 标记首个有效交易/快照日，基线早于该日时直接以零基线求 WTD/MTD/YTD。
- 重写 `calcWtdMtdYtd`/`calcWtdMtdYtdFromSnapshots`，按“累计实盈 + 端点浮盈差”口径求值，并在缺失预期基线时标记退化而不返回 NaN。
- 调整 `needsSyntheticDailyResults` 不再强制窗口前一日具备浮盈字段，避免无历史场景下的快照重算。
- 更新多组单测（去重、缺基线、时区守护等）并运行若干 `npm test` 用例覆盖新口径。

## 2025-10-18
- `calcWtdMtdYtdFromSnapshots` 与 `explainWtdMtdYtdFromSnapshots` 增加基线模式、首个活跃日、拆解信息，支持零基线与 partial 状态区分；`WindowTotalsResult` 透出 per-period breakdown。
- `collectPeriodHealthIssues` 新增 ΔU 缺基线价诊断：基线在首日之前视为零基线，partial 场景生成灰色提示并列出缺价标的；允许带 `missingBaselineSymbols` 的快照缺失 `unrealized`。
- Dashboard 周/月/年卡片接入 `_period.status` 与 breakdown：partial 周期仅展示实盈 + “ΔU 待补充”徽标；`period-health` 摘要新增 partial 灰色样式，`syncPeriodHealth` 接入完整 `_period` 元数据。
- 补充 `metrics-wtd-mtd-ytd.week-start-monday.partial-baseline.test.ts`、`dataHealth.partial-baseline.test.ts` 等单测，回归 `metrics-ny-date-normalization.test.ts` 验证周一基线解析；针对 ok_zero/partial 状态扩展既有测试断言。

## 2025-10-19
- 调整 Dashboard 指标摘要文案，仅在状态为 `missing`/`degraded` 且存在阻断性诊断时提示“检测到其它关键数据缺失”，避免 partial 灰框重复出现警告语。

## 2025-10-20
- 重写 FIFO 成交回放的滚动保本价计算：新增累计持仓成本字段，按“(累计持仓成本 − 累计已实现盈亏) ÷ |当前净持仓|” 生成多头/空头盈亏平衡点，空头返回负值。
- 更新 `PositionsPage` 与 `PositionsTable`，为每个持仓附带新的盈亏平衡价，空头在前端展示绝对值并加“空头”标签，缺乏数据时提示“数据不足”。
- 扩充 `computeFifo` 单测覆盖空头回补盈利后的保本价为负场景，并调整相关指标单测的基准数据。

## 2025-10-21
- FIFO 撮合新增 `breakEvenJ` 与 `breakEvenJSticky`：净仓存在时按“(累计持仓成本 − 累计已实现盈亏) ÷ |净持仓|” 返回 J，净仓归零保留 Sticky 记录供复核。
- 扩展 `EnrichedTrade` 暴露累计成本、累计实盈与净仓，新增自检用例覆盖多空转向、穿越和平仓后的 Sticky 行为。
- `PositionsTable` “盈亏平衡点” 列改读 `breakEvenJ`，净仓为零时显示 “—” 并提示“上次保本价”，保持空头负号在数据层存储。
- 新增 `selfcheck:j:sticky` 脚本以及前端轻测，便于快速验证 Sticky J 显示链路。
