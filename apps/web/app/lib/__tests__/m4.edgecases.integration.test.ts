import { runAll, type RawTrade } from "../../lib/runAll";
import type { InitialPosition } from "../../lib/fifo";
import { round2 } from "../../lib/money";
import { nyDateStrSafe } from "../../lib/time";

type Scenario = {
  evalISO: string;
  positions: InitialPosition[];
  trades: RawTrade[];
  close: Record<string, Record<string, number>>;
  dailyResults: Array<{ date: string; realized: number; unrealized?: number }>;
  options: { evalDate?: Date };
};

function baseScenario(): Scenario {
  return {
    evalISO: "2025-01-03",
    positions: [],
    trades: [],
    close: {},
    dailyResults: [],
    options: {},
  };
}

function buildArgs(input: Scenario): Parameters<typeof runAll> {
  const evalISO = input.evalISO;
  const evalDate = input.options.evalDate ?? new Date(`${evalISO}T16:00:00-05:00`);
  return [
    evalISO,
    [...input.positions],
    [...input.trades],
    { ...input.close },
    { dailyResults: [...input.dailyResults] },
    { ...input.options, evalDate },
  ];
}

type BreakdownRow = {
  into?: string;
  pnl_raw?: number;
  pnl?: number;
  qty?: number;
  from?: string;
  lotDateStr?: string;
};

type Breakdown = {
  all: BreakdownRow[];
  m4: BreakdownRow[];
  m5_1: BreakdownRow[];
  m5_2: BreakdownRow[];
};

function breakdownFromResult(result: any): Breakdown {
  const source = result?.aux?.breakdown;
  if (Array.isArray(source)) {
    const all = source.map((row: any) => ({ ...(row ?? {}) }));
    return {
      all,
      m4: all.filter((row) => row.into === "M4"),
      m5_1: all.filter((row) => row.into === "M5.1"),
      m5_2: all.filter((row) => row.into === "M5.2"),
    };
  }
  return {
    all: Array.isArray(source?.all) ? source.all : [],
    m4: Array.isArray(source?.m4) ? source.m4 : [],
    m5_1: Array.isArray(source?.m5_1) ? source.m5_1 : [],
    m5_2: Array.isArray(source?.m5_2) ? source.m5_2 : [],
  };
}

function sumRaw(rows: BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.pnl_raw ?? 0), 0);
}

type ScenarioResult = {
  result: Awaited<ReturnType<typeof runAll>>;
  breakdown: Breakdown;
};

async function runScenario(prepare: (scenario: Scenario) => void): Promise<ScenarioResult> {
  const scenario = baseScenario();
  prepare(scenario);
  const args = buildArgs(scenario);
  const result = await runAll(...args);
  const breakdown = breakdownFromResult(result);
  return { result, breakdown };
}

describe("M4 edge cases hardening", () => {
  test("A) 拆股后成本按复权计算，历史腿才进入 M4", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      // 仓位已预先按 2-for-1 拆股复权：数量翻倍、成本减半
      scenario.positions.push({ symbol: "AAA", qty: 200, avgPrice: 10 });
      scenario.trades.push({
        date: "2025-01-03T10:00:00-05:00",
        side: "SELL",
        symbol: "AAA",
        qty: 60,
        price: 12,
      });
      scenario.close.AAA = { "2025-01-03": 12 };
    });

    expect(round2(result.M4)).toBeCloseTo(120, 6);
    expect(round2(sumRaw(breakdown.m4))).toBeCloseTo(result.M4, 6);
    expect(breakdown.m4.every((leg) => leg.from === "history")).toBe(true);
  });

  test("B) 现金分红不影响 M4 历史腿", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      scenario.evalISO = "2025-01-05";
      scenario.positions.push({ symbol: "BBB", qty: 100, avgPrice: 10 });
      scenario.trades.push({
        date: "2025-01-05T10:00:00-05:00",
        side: "SELL",
        symbol: "BBB",
        qty: 40,
        price: 11,
      });
      scenario.close.BBB = { "2025-01-05": 11 };
    });

    expect(round2(result.M4)).toBeCloseTo(40, 6);
    expect(round2(sumRaw(breakdown.m4))).toBeCloseTo(result.M4, 6);
    expect(breakdown.m4.every((leg) => leg.from === "history")).toBe(true);
  });

  test("C) 乘数仅应用一次：腿级 raw 求和与 result.M4 一致", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      scenario.evalISO = "2025-01-06";
      scenario.positions.push({ symbol: "CCC", qty: -50, avgPrice: 150 });
      scenario.trades.push({
        date: "2025-01-06T11:00:00-05:00",
        side: "COVER",
        symbol: "CCC",
        qty: 20,
        price: 100,
      });
      scenario.close.CCC = { "2025-01-06": 100 };
    });

    const m4Rounded = round2(result.M4);
    expect(m4Rounded).toBeCloseTo(1000, 6);
    const sum = round2(sumRaw(breakdown.m4));
    expect(Math.abs(sum - m4Rounded)).toBeLessThanOrEqual(0.01);
  });

  test("D) 盘后跨日以纽约日判定历史腿", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      scenario.evalISO = "2025-01-07";
      scenario.positions.push({ symbol: "DDD", qty: 100, avgPrice: 10 });
      scenario.trades.push({
        date: "2025-01-07T00:15:00-05:00",
        side: "SELL",
        symbol: "DDD",
        qty: 30,
        price: 11,
      });
      scenario.close.DDD = { "2025-01-07": 11 };
    });

    expect(round2(result.M4)).toBeCloseTo(30, 6);
    expect(breakdown.m4.every((leg) => leg.from === "history")).toBe(true);
    expect(
      breakdown.m4.every((leg) =>
        leg.lotDateStr ? nyDateStrSafe(leg.lotDateStr) <= "2025-01-06" : true,
      ),
    ).toBe(true);
  });

  test("E) 同一成交混配必须拆腿，仅历史腿计入 M4", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      scenario.evalISO = "2025-01-08";
      scenario.positions.push({ symbol: "EEE", qty: 100, avgPrice: 10 });
      scenario.trades.push(
        {
          date: "2025-01-08T09:45:00-05:00",
          side: "BUY",
          symbol: "EEE",
          qty: 50,
          price: 12,
        },
        {
          date: "2025-01-08T10:30:00-05:00",
          side: "SELL",
          symbol: "EEE",
          qty: 120,
          price: 11,
        },
      );
      scenario.close.EEE = { "2025-01-08": 11 };
    });

    expect(round2(result.M4)).toBeCloseTo(100, 6);
    const m4Qty = breakdown.m4.reduce((sum, leg) => sum + Number(leg.qty ?? 0), 0);
    expect(m4Qty).toBeCloseTo(100, 6);
    expect(breakdown.m4.every((leg) => leg.from === "history")).toBe(true);
    const todayQty = breakdown.m4
      .filter((leg) => leg.from !== "history")
      .reduce((sum, leg) => sum + Number(leg.qty ?? 0), 0);
    expect(todayQty).toBeCloseTo(0, 6);
  });

  test("F) 今日已实现恒等式：M4 + intraday == today_total", async () => {
    const { result, breakdown } = await runScenario((scenario) => {
      scenario.evalISO = "2025-01-09";
      scenario.positions.push({ symbol: "FFF", qty: 80, avgPrice: 10 });
      scenario.trades.push(
        {
          date: "2025-01-09T09:50:00-05:00",
          side: "BUY",
          symbol: "FFF",
          qty: 40,
          price: 12,
        },
        {
          date: "2025-01-09T13:30:00-05:00",
          side: "SELL",
          symbol: "FFF",
          qty: 100,
          price: 11,
        },
      );
      scenario.close.FFF = { "2025-01-09": 11 };
    });

    const m4Rounded = round2(result.M4);
    const m4Raw = round2(sumRaw(breakdown.m4));
    expect(Math.abs(m4Raw - m4Rounded)).toBeLessThanOrEqual(0.01);
    const intraday = round2(sumRaw(breakdown.m5_2));
    const todayTotal = Number(result?.aux?.realized?.today_total ?? 0);
    const intradayReported = Number(result?.aux?.realized?.today_intraday ?? 0);
    expect(Math.abs(m4Rounded + intradayReported - todayTotal)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(intraday - intradayReported)).toBeLessThanOrEqual(0.01);
  });
});
