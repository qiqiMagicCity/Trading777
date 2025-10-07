# 更新日志

## 2025-11-11
- 更正【持仓列表-当日盈亏】口径：新增两桶法专用 `buildIntradayFloatingPnlMap`，前端改读浮动盈亏并更新列标题为“当日浮动盈亏”，排除今日已实现贡献，补充分项断言确保部分平仓、翻向与纯过夜场景均按四位精度返回。

## 2025-11-10
- Step 7：收盘价缺失策略重构
  - 新增 `marketHours.ts` 统一判断交易日、收盘窗口与宽限期，Dashboard 侧在 `ensureDailyCloses` 前判定是否已过宽限再发起补录。
  - `generateDailyResults` 扩展 `DailyResultsDiagnostics`，区分 `pendingCloses` 与 `missingCloses`，并透出 `closeWindow`（含宽限分钟、窗口截止与 `missingClose` 标记）。
  - Dashboard 顶部新增信息条展示“今日尚未收盘”提示，盘前/盘中/周末沿用上一交易日收盘价且不再出现“均价兜底”告警。
  - 引入 `closePriceMigration` 处理 close_prices 的 UTC→纽约日键迁移与冲突合并，写入 `close.ny_migrated_v1` 防止重复迁移。
  - 新增 `close-missing-policy.weekend-skip/preopen-info/postclose-grace-missing.test.ts` 及 `close-keys.ny-migration.test.ts`，并更新 `dailyResults-diagnostics.test.ts` 覆盖新诊断字段。
  - 修正 `fetchDailyClose` 对历史交易日的宽限判定：日线 API 无结果时，如 `evaluateCloseRequirement` 判定需官方收盘价，则接受调用方 fallback 并落盘，恢复“API 不可用时仍能补写官方收盘价”场景。
  - `close-missing-policy.postclose-grace-missing.test.ts` 引入 `resolveCloseGraceMinutes()` 断言默认宽限为 0 分钟并允许运营设定覆盖。
  - 运行 `npm test -- apps/web/app/lib/__tests__/close-missing-policy.weekend-skip.test.ts --runInBand` 等 7 条指令与 `npm test -- apps/web/app/lib/__tests__/priceService.safe.test.ts --runInBand` 全部通过。

## 2025-11-10
- Step 6：Dashboard “当日盈亏”卡片接入 `_m6` 拆解 Tooltip，展示 realized_today / mtm_overnight / mtm_intraday_open 分项，默认首行提示纽约日口径及 20:00–23:59 ET 仍计入当日。
- Tooltip 触发按钮新增可聚焦问讯样式（含 aria-label），健康状态下沿用灰色圆点，存在警示/解析失败时切换为琥珀底色并附带退化/告警/解析摘要。
- 解析 `_m6` 原始字段时复用 `parseSnapshotNumber` 去除负零，并聚合 diagnostics.parseErrors + warnings，Tooltip 尾部统一输出 ⚠️ 提示，若缺乏当日快照则退化为“待补充 + 无当日快照”。
- DashboardMetrics 单测扩充 5 个场景（仅 MTM、空头回补、全零、缺快照、解析失败），断言合计恒等式、Tooltip 文案与按钮无障碍属性；沿用 `within` 精准定位卡片。
- 运行 `npm test -- apps/web/app/modules/__tests__/DashboardMetrics.test.tsx --runInBand`、`npm test -- apps/web/app/modules/__tests__/positionMetrics.test.ts --runInBand` 全部通过。

## 2025-11-09
- Step 5：`calcMetricsInternal` 建立唯一 `periodEvalYmd` 来源（入参优先，其次 `nyTodayStr()`），UI 冻结日独立维护并禁止再以 `getLatestTradingDayStr` 回退周期窗口；交易、日度快照过滤统一按纽约日并包含评估日当日。
- 修复回归：移除 `periodEvalYmd` 对 `tradingDateStr` 的隐式回退，所有调用方（含 `runAll`、Dashboard 页面与相关单测）改为显式传入评估日，确保周/月/年聚合恒以真实评估日为锚。
- `calcWtdMtdYtdFromSnapshots` / `deriveWindowTotals` 透出 `uiTradeDayYmd`、`periodEvalYmd`、`filteredRowsCount`、`lastSnapshotYmd`、`windowStartYmd` 等诊断字段，`calcMetricsInternal` 在 UI 日≠评估日且纳入新快照时追加 `PERIOD_EVAL_DAY_INCLUDED` 调试日志。
- 新增 `metrics-evalday-decoupling.freeze-vs-eval.test.ts`、`metrics-evalday-decoupling.after-hours.test.ts`、`metrics-evalday-decoupling.holiday-dst.test.ts` 三组回归用例，验证周末冻结、盘后、节假日 & DST 场景下 WTD/MTD/YTD 均按真实评估日累计。

## 2025-11-08
- 抽取 `parseSnapshotNumber` 统一解析日度快照的数值字段，支持数字字符串输入并在非法格式时返回 `PARSE_NUM_FAILED` 诊断。
- `runAll.normalizeDailyRows`、`metrics.ts`、`metrics-periods.ts` 全量复用新解析器，删除 `typeof === "number"` 兜底并在解析失败时透出 `DEGEN_PARSE_FAILED` 退化。
- `calcWtdMtdYtdFromSnapshots`、`computePeriods`、`DashboardMetrics` 将解析失败汇总到 diagnostics.parseErrors，前端 tooltip 展示字段与示例原值。
- 补充字符串数值、非法格式、负零与入口一致性的单元测试，更新 `DailyResult` 联合类型以覆盖字符串输入。

## 2025-11-06
- 当日盈亏映射新增纳入 `realized_today`，`PositionsTable` 读取合并结果，单测覆盖部分平仓/纯未实现/纯已实现三类场景。
- Dashboard 周/月/年卡片在退化时展示中文退化原因徽标与基线提示 tooltip，补充 UI 单测验证缺基线、基线过旧、窗口为空三种原因。
- 更新 Dashboard 指标用例：仍为退化或缺值的窗口继续显示“待补充”，基线过期但周度仍有效时保留数值显示。

## 2025-11-07
- 当日盈亏空头场景补充“盈利为正、亏损为负”单测，确认合并映射不再翻转 FIFO 符号。
- 周/月/年退化提示的 tooltip 增加阈值描述并改用可聚焦按钮，键盘与读屏均可获取退化原因，单测同步断言。
- 修复 Vercel 构建报错：`DashboardMetrics` 读取 `_period.diagnostics` 时类型缺失触发 TS 报错，补齐 `Metrics._period` 的 `diagnostics` 定义确保类型一致。

## 2025-11-05
- 修复同日快照信息量评分返回字符串的问题，确保并列裁决严格基于数值信息量。
- 清理 `metrics-periods.ts` 中未使用的正午归一导入，避免后续回退误用。

## 2025-11-04
- calcMetricsInternal / calcTodayTradePnL 的纽约当日判定统一改用 `nyDayStr`/`nyDateStrSafe`，不再通过 `toISOString()` 取 UTC 日期，修复隔夜仓被误归类为“今日新开”的问题。
- 新增 `metrics-overnight-short-classification.test.ts`，覆盖 2025-01-14 20:30 -05:00 卖空的隔夜留仓，确认次日归入过夜浮盈且日内盈亏为 0。

## 2025-11-03
- `getLatestTradingDayStr` 改为以纽约日历日作为交易日标记，仅在周末回退至最近工作日，避免盘前误判上一交易日。
- 更新 `tradingDay` 相关 helper 及单测，盘前/盘后均归属当日交易日，周末仍回退上一个工作日。
- 调整 `timezone.test.ts`、`tradingDay.test.ts` 与 `metrics` 类型注释，同步描述与断言新交易日口径。

## 2025-11-02
- 新增 `precision.ts`，提供银行家舍入的 `round4/add4/sub4/mul4` 等辅助函数，所有当日盈亏计算步骤统一按四位精度逐步舍入。
- 重写 `_calcM6Strict` 与 `calcM6Detailed` 的两桶法逻辑：过夜桶与当日新开桶在差价、乘数与汇总环节均使用四位银行家舍入，并在缺价/缺均价时跳过计算、保留诊断。
- 调整 `buildTodayLots` 对当日剩余买卖均价的加权过程，逐笔金额与均价都按四位精度累积，避免累计误差。
- 更新相关 Jest 用例，确认新精度规则下的当日盈亏拆解仍保持恒等式，重点回归纯过夜、翻向与今日加仓场景。

## 2025-10-31
- 阅读既有日志至 2025-10-29，确认持仓表当日盈亏口径需改进。
- 基于 M6 legs 新增 `buildIntradayPnlMap`，优先汇总隔夜与当日未平贡献。
- 复用新映射改写 PositionsTable 当日盈亏计算与日志输出，并将表头改名为“当日盈亏”。
- 更新 positionMetrics 单测覆盖 M6 legs 汇总与降级路径，运行 `npm test -- apps/web/app/modules/__tests__/positionMetrics.test.ts` 通过。

## 2025-11-01
- 移除当日盈亏旧口径的数值回退，缺数据时直接提示“待补充”并说明缺失的 M6 legs 拆解或代码信息。
- PositionsTable 列渲染及总计行改为读取拆解结果，缺项时以黄色文本提示补齐数据。
- 调整 `buildIntradayPnlMap` 返回拆解状态，`calculateIntradayValue` 输出详细缺口原因，并更新相关单测。

## 2025-10-30
- 抽取 `normalizeSymbol` 统一股票代码大写与字符过滤逻辑，避免手动输入与编辑初始值出现不一致的字符。
- `AddTradeModal` 读取历史列表与提交后写入时复用新 helper，确保本地存储与输入框保持同一规则。
- 调整 `persistSymbolHistory` 先写入本地存储再更新状态，避免组件卸载后历史未写入。

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
- Step 5 收尾：runAllCore 统一归一化日度快照
  - runAllCore 入口对 MinimalDailyResult 执行 normalizeDailyRows，记录归一化前后行数并在内部仅保留纯数值 DailyResult[]。
  - 含字符串数值的日度快照通过 runAll → calcMetrics 链路与纯数字版产出一致，并补充千分位字符串触发 DEGEN_PARSE_FAILED 的端到端单测。
  - 新增静态守护脚本 `check-calcmetrics-daily`，阻止在 apps/web/app/lib 中重新引入 `as DailyResult(Input)` 的断言路径。
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
- FIFO 成交回放新增 breakEvenJ/breakEvenJSticky、自检字段与 Sticky 逻辑，净仓归零保留最近 J 并输出恒等式所需的累计成本/实盈/净仓。
- Position/PositionsTable 引入新字段，盈亏平衡列按绝对值 + 空头徽标展示，无实时 J 时回落到“— / 上次保本价 …”。
- 新增 `breakevenJ.sticky` 与 `PositionsTable.breakevenJ` 单测覆盖 6 大场景及 UI 展示恒等式，自检脚本 `npm run selfcheck:j:sticky` 通过。
- package.json 增加 `selfcheck:j:sticky` 脚本，后续可一键校验 J 与 UI 自检。

## 2025-10-22
- 新增 `ymdInNY`，改用纽约时区分量拼接日期字符串，替换 `getLatestTradingDayStr`、周/月/年起始函数中的 `toISOString().slice(0, 10)`。
- 扩展 `getLatestTradingDayStr` 单测覆盖纽约晚间与凌晨场景，确认不会提前到次日且开盘前仍回退上一交易日。
- 运行 `npm test -- apps/web/app/lib/__tests__/timezone.test.ts`，所有断言通过。

## 2025-10-23
- 修复 Vercel 构建报错：`computeFifo` 中将 `direction`（仅可能为多/空）与 `'NONE'` 比较，TS 认定类型无交集导致 `next build` 中断。
- 原因是空头/多头初始化时多余的 `'NONE'` 判定；去除比较后直接沿用方向即可，既符合业务预期也满足类型收窄。
- 重新执行 `CI=1 npm run build --workspace web`，构建顺利完成，仅剩历史告警，无新增报错。

## 2025-10-24
- 调整 `calcTodayFifoPnL` 以复用交易视角的日内配对结果，并改用全局 FIFO 成本重算 M5.2，覆盖“卖出历史持仓但在日内闭环”场景。
- 新增 AMZN 历史持仓 + 日内闭环单测，验证 M5.2 以 FIFO 成本得到预期收益。

## 2025-10-25
- 新增 `dataset.ts`，实现 `ensureDatasetReady`/`hasUserData`，根据 `NEXT_PUBLIC_SEED_MODE` 控制播种逻辑，并在发现现有数据时优先返回 IndexedDB。
- `providers`、`page`、`positions/page` 均改为调用新入口并打印 `[dataset] ready` 日志，生产默认保持空库，开发模式仍支持演示数据。
- `dataService` 导出 `markDatasetAsCustom`、`getAnyPositionCount`，配合新初始化逻辑补写标记；`ensureBuiltInDatasetLoaded` 保留别名兼容。
- 重写初始化相关单测（`ensureDatasetReady.test.ts`），覆盖空库 + off/demo、自动补标记、自定义数据分支，并新增 `.env.production` 设置 `NEXT_PUBLIC_SEED_MODE=off`。

## 2025-10-26
- `computeFifo` 记录多/空各自的 Sticky 保本价，补充 `breakEvenJStickyLong/Short` 字段供前端读取。
- 个股详情页盈亏平衡点遵循“只展示真实方向”规范：实时显示当前方向，历史场景按多头/空头各渲染一行且保留两位小数，无占位符。
- 回归 `breakevenJ.sticky` 单测，确认多空 Sticky 追踪与页面展示逻辑协同生效。

## 2025-10-27
- 调整个股详情页盈亏平衡点历史段落容器为纵向居中对齐，保证多空文本在表格内垂直排列并居中展示。

## 2025-10-28
- 对 `apps/web/public/js/fifo.js` 的空头保本价计算改用 “累计成本 + 累计已实现盈亏” 口径，保持与 TypeScript 版本一致。
- 手动在前端回放含空头仓位的示例数据，确认保本价与 `app/lib/fifo.ts` 输出一致，未再出现正负号相反的问题。

## 2025-10-29
- `AddTradeModal` 新增本地股票代码历史状态，挂载时从 `localStorage` 读取并去重裁剪。
- 提交交易后更新股票代码历史，写回 `localStorage` 并保持列表长度上限。
- 股票代码输入框接入 `datalist` 建议，沿用大写与字符过滤逻辑便于快速选择历史记录。
- 处理 Vercel 构建报错：`PositionsTable` 汇总当日盈亏提示时直接 `map` 取 `message`，TS 未识别 `filter` 的收窄而报缺少属性。
- 调整逻辑改用 `Set` 收集缺失提示，循环中基于 `status === "missing"` 时访问 `message`，构建再次通过类型检查。

## 2025-10-30
- Step 2-A：WTD/MTD/YTD 聚合改为唯一基线，缺失或超过阈值的基线直接退化并返回 `DEGEN_*` 原因码，同时透出基线日期与交易日距离；评估日完全按调用方传入的纽约日处理，彻底移除内部回退逻辑。
- Step 2-B：新增无基线、基线距阈值边界、周末评估与去重等单测，显式引用退化阈值常量并校验 `diagnostics.reason/baselineMeta`，确保三项聚合不再粘连。
- 修复 Vercel 构建报错：`calcWtdMtdYtdFromSnapshots` 返回状态仍保留零基线 `ok_zero` 分支，TS 判断 `baselineMode` 不可能等于 "zero" 导致 `next build` 中断；移除已废弃的状态分支后重新执行 `CI=1 npm run build --workspace=web`，构建顺利完成，仅保留既有 ESLint 告警。

## 2025-10-31
- 统一同日去重/排序逻辑（NY 日）。
- 随机乱序/跨午夜/DST 稳定性测试上线。
- 两入口共用 helper，消除输入顺序依赖。
- 修复构建报错：`infoScore` 在对象分支使用 `reduce` 时返回值被推断为 `unknown`，Next.js 构建阶段抛出 “Type 'unknown' is not assignable to type 'number'”；改用显式循环累加字段信息量，保持评分纯数值且类型稳定。
- 修复构建报错：`selectLatestSnapshotsByNyDay` 直接把 `unknown` 类型的 `date` 透传给 `nyDateStrSafe`，导致 Next.js 构建期类型检查失败；增加类型守卫，仅接受 `string | number | Date`，并保持原有时间判定逻辑。
- Step 4：同日重复快照默认选最新且不再退化，`diagnostics.sameDayDuplicates` 记录重复计数，覆盖基线重复/同毫秒并列/含解析失败等单测，确保仅 DEGEN_NO_BASELINE、DEGEN_STALE_BASELINE、DEGEN_PARSE_FAILED、DEGEN_WINDOW_EMPTY 会触发退化。
- 修复 Vercel 构建报错：`runAllCore` 的 `dailyResults` 入参仍限定为纯 `number` 字段，无法接收通过 Zod 校验后的 `string|null` 数值字符串，Next.js 构建阶段类型检查失败；改为接受 `MinimalDailyResult[]` 并移除未使用的 `DailyResultInput` 引用，保持统一解析链路类型一致。同批构建中 `scripts/verify-real.ts` 也沿用旧的 `DailySnap` 数值类型，改用 `DailyResultInput` 以兼容字符串数值快照。

## 2025-11-01
- Step 6 收口：`DashboardMetrics` 消除 `if (!metrics) return` 条件 Hook，统一以 `metricsReady` 控制渲染，保持 Hook 顺序恒定并保留加载占位样式。
- `turbo.json` 注册 PRICE_STRICT、READ_PUBLIC_MODE 等环境变量；`env.ts` / `readPublicJson.ts` 补充 catch 注释避免 `no-empty`，`timezone.ts` 注释去除不规则空格。
- `package.json` 的 lint 指令改为 `npx --yes turbo run lint`，确保仓库级别 lint 复用 Turbo pipeline。
- 测试：`npm test -- apps/web/app/modules/__tests__/positionMetrics.test.ts --runInBand`、`npm test -- apps/web/app/modules/__tests__/DashboardMetrics.test.tsx --runInBand`；构建：`npm run build`；Lint：`npm run lint`（仍存在历史 `no-explicit-any` 警告，但未再触发 react-hooks/no-empty/no-irregular-whitespace 相关报错）。

## 2025-11-02
- Step 6 降噪：`calcMetricsInternal` 在未指定 `periodEvalYmd` 时尊重 `NEXT_PUBLIC_FREEZE_DATE`，确保冻结评估日的 M7 交易计数与当日盈亏拆解一致；同步保留 UI 交易日选择器的纽约截日逻辑。
- `.eslintrc.json` 与 `apps/web/eslint.config.js` 新增 `__tests__`、`app/lib` 目录豁免规则，逐项移除 `any`、`unused`、`prefer-const` 等历史噪音，`Header` / `page.tsx` / `runAll.ts` / `priceService.ts` 等核心文件补足类型守卫与 Hook 依赖。
- CI `build-main.yml` 串联 `npm run check:calcmetrics-daily`，`package.json` 补充 `test:periods-core`、`test:m6-ui` 快捷脚本，守护脚本与核心回归纳入日常执行清单。
- 测试：`npm run lint`、`npm run check:calcmetrics-daily`、`npm run test:periods-core`、`npm run test:m6-ui`、`npm test -- apps/web/app/modules/__tests__/DashboardMetrics.test.tsx --runInBand`、`npm test -- apps/web/app/modules/__tests__/positionMetrics.test.ts --runInBand`。
- 修复 Vercel 构建报错：`resolveNyDay` 接收 `(typeof window !== "undefined" && window.NEXT_PUBLIC_FREEZE_DATE)` 时被推断为 `{}`，Next.js 构建类型检查失败（期望 `string | undefined`）。改为分别读取 `process.env` 与 `window` 的候选值，并通过 `typeof === "string"` 收窄后再传入 `resolveNyDay`，重跑 `npm run build` 通过。
- 修复 Vercel 构建报错：Dashboard M6 卡片读取 `tradingDateStr` 时直接访问 `MetricsContract` 上不存在的字段，TS 推断 `{} | undefined` 导致 `next build` 中断。改用 `isRecord` 收窄原始对象并对 `intradayDiagnostics.uiTradeDayYmd` / `rawMetrics.tradingDateStr` 做字符串判定后再回退，`npm run build --workspace=web` 通过。

## 2025-11-03
- `positionMetrics.ts` 新增 `buildIntradayFloatingBreakdown`，输出过夜/当日新开两桶的银行家舍入结果、乘数、昨今净仓与均价，统一从 legs 汇总并在合成后只乘一次乘数；`buildIntradayFloatingPnlMap` 改读新拆解保持 UI 金额一致。
- `PositionsTable` 引入浮动拆解调试映射，列标题提示乘数只在两桶求和后应用，单元格 tooltip 展示过夜桶/当日新开桶公式、乘数、昨今净仓等细节。
- `positionMetrics.test.ts` 增补“乘数=100 只乘一次”与“日内配对后剩余 15 股”场景，验证浮动口径与 VWAP/乘数逻辑稳定；原有断言同步适配新拆解入口。
- 测试：`npm test -- apps/web/app/modules/__tests__/positionMetrics.test.ts --runInBand`。
- 再补口径守护：新增银行家舍入卡点、净仓归零与缺昨收三条单测锁定浮动盈亏边界；tooltip 追加“缺昨收时过夜桶=0；当日已实现请见‘今日已实现’。” 提示，首日场景与净仓归零提示一致。

## 2025-10-06 M4 自检与单测
- 新增 selfcheckM4，覆盖时区判定、混合配对拆分、读源一致性与四舍五入时机。
- 新增五组合成用例与前台读源一致性校验。
- 新增脚本 `npm run selfcheck:m4`。

## 2025-10-07 M4 纽约日口径与混合腿拆分修复
- runAll 统一使用纽约交易日判定，腿级明细补充 `from`、`lotDateStr`、`fillId` 与 `pnl_raw`，并按“先合计后 round2”计算 M4/M5；同时透出 `aux.realized.today_intraday/today_total`。
- 修复混合配对未拆分与今日腿误入 M4 的问题，确保同一 fill 同时生成历史腿与今日腿；M6 今日已实现改为 `M4 + M5_2`，与 UI 聚合保持一致。
- 自检回归套件升级为八条强断言，新增跨日 23:00 场景与混合 fill 拆腿检查；保留 `npm run selfcheck:m4` 并新增 `npm run test:m4:fix` 统一触发。
## 2025-10-06 M4 前台对齐与调试视图
- 聚合层统一读取 runAll 覆盖后的 result.M4。
- PositionsTable 增加“历史平仓(M4)”明细并仅走聚合层数据。
- 新增 /debug/m4 调试页，展示 aux.breakdown.m4 腿级明细，并校验 sum(pnl_raw)≈result.M4。
- 新增 UI 测试脚本 `npm run test:m4:ui`，保障读源与合计恒等式不回退。
## 2025-10-08 M4 边界加固
- 新增 `m4.edgecases` 回归套件，覆盖拆股复权、现金分红、乘数一次、纽约盘后跨日、混配拆腿与今日已实现恒等式。
- 自检增强：若发现腿未明确标记 `from='history'`，将结合 NY 交易日判断并直接报错，附带 fillId/lotDateStr 定位。
- 新脚本 `npm run test:m4:edge` 纳入 CI，要求全部场景通过。
## 2025-10-06 Slim /debug/m4
- /debug/m4 改为静态 + 客户端 fetch。
- 新增 /api/debug/m4，使用注入的 apiIoProvider 调用已有 /api/* 拉数据再计算，避免把 public 打进 lambda。
- runAll 支持 ioProvider 注入，并把 readPublicJson 改为惰性 import。
- 解决 Vercel Serverless Function 体积超限（300MB）问题。
