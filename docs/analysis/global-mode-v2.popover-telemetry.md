# 诊断弹窗最小化埋点

## 事件
- `mode-popover-opened`：用户点击信息按钮打开；payload `{source, missingCount, reason: 'toggle'}`
- `mode-popover-closed`：关闭弹窗；payload `{source, missingCount, reason: 'toggle' | 'outside-click' | 'meta-cleared'}`
- `mode-popover-retry-clicked`：回退视图点击“重试计算”；payload `{source}`

## 实现要点
- 新增 `apps/web/app/lib/telemetry.ts`，默认 no-op；若 `window.DEBUG_TELEMETRY` 为真则 `console.info`。
- 未引入第三方依赖，不改变业务公式与数据流。

## 下一步可选
- 需要对接实际日志/埋点平台时，只需在运行时调用 `setTelemetrySink(fn)`。
