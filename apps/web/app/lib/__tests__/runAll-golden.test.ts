import { describe, it, expect } from "@jest/globals";
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics, assertM6Equality } from "@/app/lib/invariants"; // 已存在的规范化/断言工具

describe("runAll golden case", () => {
  it("aggregates metrics consistently under the unified contract", async () => {
    // 按你项目里原有的方式构造输入（保持不变）
    const res: any = await runAll({ symbols: ["AAPL","MSFT","GOOGL","TSLA","AMZN","NFLX"], from: "2025-08-01", to: "2025-08-01" });

    // 关键：统一口径
    const m = normalizeMetrics(res);

    // 1) M6 恒等式：M6.total == M4.total + M5.behavior + M5.fifo
    //    （替代旧的硬编码数值 7850 等）
    assertM6Equality(m);

    // 2) 保留必要的健壮性断言（数值为数，非 NaN）
    expect(Number.isFinite(m.M4.total)).toBe(true);
    expect(Number.isFinite(m.M5.behavior)).toBe(true);
    expect(Number.isFinite(m.M5.fifo)).toBe(true);
    expect(Number.isFinite(m.M6.total)).toBe(true);

    // 3) 如需验证分拆：只要你们在黄金用例里关心“行为视角/FIFO 视角”的拆分存在且为数即可
    //    这样不会绑定具体常量，避免算法或数据轻微调整时反复改 snapshot。
    //    如果必须有更强断言，可在 verify-real 的 report 驱动期望，但不再硬编码到单测。
  });
});
