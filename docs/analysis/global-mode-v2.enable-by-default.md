# V2 默认启用（构建期开关已移除）

## 改动要点
- 移除了对 `NEXT_PUBLIC_MODE_ENGINE_V2` 的所有依赖；
- 删除了基于开关的 `return null` 早退逻辑；
- 测试用例不再注入环境变量，默认验证 V2 行为；

## 不变事项
- 不修改任何 M 指标计算与数据来源；
- `StatusBadge` 与 `Header` 仍按 `meta` 驱动（meta-only）。
