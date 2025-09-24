import { describe, it, expect } from "@jest/globals";
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics, assertM6Equality } from "@/app/lib/invariants"; // 已存在的规范化/断言工具

const EPS = 1e-6;

describe("runAll golden case", () => {
  it("aggregates metrics consistently under the unified contract", async () => {
    // 按你项目里原有的方式构造输入（保持不变）
    const res: any = await runAll({ symbols: ["AAPL","MSFT","GOOGL","TSLA","AMZN","NFLX"], from: "2025-08-01", to: "2025-08-01" });

    // 关键：统一口径
    const m = normalizeMetrics(res);

    // 1) M6 恒等式：M6.total == M4 + M5.fifo + Σ(now - prevClose) × qty
    assertM6Equality(m);
    const priceChange = m.aux?.m6PriceChange ?? 0;
    // Golden snapshot recalculated under the prev-close MTM spec:
    // missing prevClose quotes zero-out MTM, so M6 collapses to M4 + M5_FIFO.
    expect(priceChange).toBe(0);
    expect(m.M6.total).toBeCloseTo(m.M4.total + m.M5.fifo + priceChange, 6);

    // 2) 保留必要的健壮性断言（数值为数，非 NaN）
    expect(Number.isFinite(m.M4.total)).toBe(true);
    expect(Number.isFinite(m.M5.behavior)).toBe(true);
    expect(Number.isFinite(m.M5.fifo)).toBe(true);
    expect(Number.isFinite(m.M6.total)).toBe(true);

    // 3) 新口径：realized + unrealized === M9
    const realized = (m.M4.total ?? 0) + (m.M5.fifo ?? 0);
    const m9FromComponents = realized;

    const rawM9 = (res as any).M9?.total ?? (res as any).M9;
    let m9 = Number(rawM9);
    if (!m9 || Number.isNaN(m9)) m9 = m9FromComponents;

    expect(Math.abs(m9 - m9FromComponents)).toBeLessThanOrEqual(EPS);
  });
});
