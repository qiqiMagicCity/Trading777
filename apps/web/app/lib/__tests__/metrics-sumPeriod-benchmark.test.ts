import { performance } from "perf_hooks";
import { sumPeriod } from "@/lib/metrics";
import type { DailyResult } from "@/lib/types";

function generateDaily(count: number): DailyResult[] {
  const start = new Date("2000-01-01T00:00:00Z");
  let unrealized = 0;
  const res: DailyResult[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    unrealized += i % 2 === 0 ? 1 : -1;
    res.push({
      date: d.toISOString().slice(0, 10),
      realized: i % 5 === 0 ? 2 : -1,
      unrealized,
    });
  }
  return res;
}

function naiveSumPeriod(
  daily: DailyResult[],
  fromStr: string,
  toStr: string,
): number {
  const fromTS = new Date(`${fromStr}T00:00:00Z`).getTime();
  const toTS = new Date(`${toStr}T00:00:00Z`).getTime();
  let total = 0;
  let prevUnrealized = 0;
  const sorted = daily.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of sorted) {
    const ts = new Date(`${r.date}T00:00:00Z`).getTime();
    const unrealized = r.unrealized ?? 0;
    if (ts < fromTS) {
      prevUnrealized = unrealized;
      continue;
    }
    if (ts > toTS) break;
    const delta =
      r.unrealizedDelta !== undefined
        ? r.unrealizedDelta
        : unrealized - prevUnrealized;
    total += (r.realized ?? 0) + delta;
    prevUnrealized = unrealized;
  }
  return total;
}

describe("sumPeriod benchmark", () => {
  it("uses cached result for repeated range", () => {
    const daily = generateDaily(20000);
    const from = daily[1000].date;
    const to = daily[15000].date;

    // warm up and verify correctness
    const naiveRes = naiveSumPeriod(daily, from, to);
    const cachedRes = sumPeriod(daily, from, to);
    expect(cachedRes).toBe(naiveRes);

    const ITER = 100;

    const t1 = performance.now();
    for (let i = 0; i < ITER; i++) {
      naiveSumPeriod(daily, from, to);
    }
    const naiveTime = performance.now() - t1;

    const t2 = performance.now();
    for (let i = 0; i < ITER; i++) {
      sumPeriod(daily, from, to);
    }
    const cachedTime = performance.now() - t2;

    // 输出用于观察
    console.log("naive:", naiveTime, "cached:", cachedTime);

    expect(cachedTime).toBeLessThan(naiveTime);
  });
});

