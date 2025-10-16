# 全局初始化 globalModeStore（已注入根布局）

- 在 app 根布局统一调用 useGlobalMeta()，确保任意页面均能启动订阅/重算；
- 不改动任何 M 指标公式；仅提升初始化位置，移除“依赖某页面是否挂载”的隐患；
- 搭配“Dashboard 徽标 meta-only”后，可显著降低新旧路径并存导致的 UI 不一致。

