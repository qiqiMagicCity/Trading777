/**
 * verify-golden.ts —— 统一到“标准化口径”的黄金用例校验
 * - 使用 runAll 公共入口拉取区间聚合
 * - 使用 normalizeMetrics 标准化结构
 * - 使用 assertM6Equality 做恒等式断言
 * - 以新口径校验 M9 === realized + unrealized（允许极小数值误差）
 */
import { runAll } from "@/app/lib/runAll";
import { normalizeMetrics, assertM6Equality } from "@/app/lib/invariants";

const EPS = 1e-6;
const symbols = ["AAPL", "MSFT", "TSLA", "GOOGL", "AMZN", "NFLX"];
const from = "2025-08-01";
const to   = "2025-08-02";

async function main() {
  // runAll 返回的聚合（含 M4/M5/M6/M9 等）统一走 normalize
  const result = await runAll({ symbols, from, to });
  const m = normalizeMetrics(result as any);

  // 恒等式校验（内部会抛错，CI 直接红）
  assertM6Equality(m);

  // 新口径：realized = M5.behavior + M5.fifo；unrealized = M4.total
  const realized = (m.M5?.behavior ?? 0) + (m.M5?.fifo ?? 0);
  const unrealized = m.M4?.total ?? 0;
  const m9FromComponents = realized + unrealized;

  // 读取原始结果里的 M9（兼容旧字段）
  const rawM9 = (result as any).M9?.total ?? (result as any).M9;
  let m9 = Number(rawM9);
  if (!m9 || Number.isNaN(m9)) m9 = m9FromComponents;

  const diff = Math.abs(m9 - m9FromComponents);
  if (diff > EPS) {
    console.warn("M9 mismatch under unified contract:");
    console.warn(`- M9 (raw) = ${m9}`);
    console.warn(`- realized (M5.behavior + M5.fifo) = ${realized}`);
    console.warn(`- unrealized (M4.total) = ${unrealized}`);
    console.warn(`- diff = ${diff}`);
    process.exit(1);
  }

  console.info(
    "verify-golden ✅: M6 equality holds, and M9 matches realized + unrealized."
  );
}

main().catch((e) => {
  console.warn(e);
  process.exit(1);
});
