# Dashboard 徽标统一改为 meta-only（已落地）

## 变更要点
- Dashboard 与 Header 中的 `<StatusBadge>` 不再传入 `status` 兜底；一律由 `meta={useGlobalMeta()}` 驱动；
- `StatusBadge` 在收到 `meta` 时强制走 V2 渲染，不再被构建期环境开关短路；
- Dashboard 内所有基于 `m123?.meta / m123PriceStatus` 的显示/显隐逻辑已移除，避免旧数据源干扰；

## 不变事项（与规则一致）
- 未改动任何 M 指标公式或数据来源，仅更换徽标数据源与渲染条件；
- 功能区1的“独立计算/来源锁死”继续生效；缺价/缺数依旧只影响本模块。
