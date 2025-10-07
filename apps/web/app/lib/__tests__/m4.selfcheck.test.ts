import { selfcheckM4 } from "../../lib/selfcheck/m4.selfcheck";
import { runAll, type RawTrade } from "../../lib/runAll";
import type { InitialPosition } from "../../lib/fifo";
import { normalizeMetrics } from "../../lib/metrics";
import { round2 } from "../../lib/money";

type Scenario = {
  evalISO: string;
  positions: InitialPosition[];
  trades: RawTrade[];
  close: Record<string, Record<string, number>>;
  dailyResults: Array<{ date: string; realized: number; unrealized?: number }>;
  options: { evalDate?: Date };
};

function baseInput(): Scenario {
  return {
    evalISO: "2024-01-02",
    positions: [],
    trades: [],
    close: {},
    dailyResults: [],
    options: {},
  };
}

function buildArgs(input: Scenario): Parameters<typeof runAll> {
  const evalISO = input.evalISO;
  const evalDate =
    input.options.evalDate ?? new Date(`${evalISO}T16:00:00-05:00`);
  return [
    evalISO,
    [...input.positions],
    [...input.trades],
    { ...input.close },
    { dailyResults: [...input.dailyResults] },
    { ...input.options, evalDate },
  ];
}

function breakdownFromResult(result: any) {
  const bucket = result?.aux?.breakdown;
  if (Array.isArray(bucket)) {
    const cloned = bucket.map((row: any) => ({ ...(row ?? {}) }));
    return {
      all: cloned,
      m4: cloned.filter((row) => row.into === "M4"),
      m5_1: cloned.filter((row) => row.into === "M5.1"),
      m5_2: cloned.filter((row) => row.into === "M5.2"),
    };
  }
  return {
    all: Array.isArray(bucket?.all) ? bucket.all : [],
    m4: Array.isArray(bucket?.m4) ? bucket.m4 : [],
    m5_1: Array.isArray(bucket?.m5_1) ? bucket.m5_1 : [],
    m5_2: Array.isArray(bucket?.m5_2) ? bucket.m5_2 : [],
  };
}

function sumRaw(legs: Array<{ pnl_raw?: number }>): number {
  return legs.reduce((sum, leg) => sum + Number(leg.pnl_raw ?? 0), 0);
}

function expectRealizedConsistency(result: any) {
  const breakdown = breakdownFromResult(result);
  const m4Raw = sumRaw(breakdown.m4);
  const intradayRaw = sumRaw(breakdown.m5_2);
  const totalRaw = m4Raw + intradayRaw;
  expect(result.M4).toBeCloseTo(round2(m4Raw), 6);
  const realizedAux = result?.aux?.realized ?? {};
  expect(realizedAux.today_intraday).toBeCloseTo(round2(intradayRaw), 6);
  expect(realizedAux.today_total).toBeCloseTo(round2(totalRaw), 6);
  expect(result?._m6?.realizedToday).toBeCloseTo(round2(totalRaw), 6);
  expect(round2(result.M4 + realizedAux.today_intraday)).toBeCloseTo(
    realizedAux.today_total,
    6,
  );
  return {
    breakdown,
    m4Raw,
    intradayRaw,
    totalRaw,
  };
}

async function runScenario(
  prepare: (input: Scenario) => void,
): Promise<{
  report: Awaited<ReturnType<typeof selfcheckM4>>;
  result: Awaited<ReturnType<typeof runAll>>;
  breakdown: ReturnType<typeof breakdownFromResult>;
  normalized: ReturnType<typeof normalizeMetrics>;
}> {
  const input = baseInput();
  prepare(input);
  const args = buildArgs(input);
  const report = await selfcheckM4(...args);
  const result = await runAll(...args);
  const breakdown = breakdownFromResult(result);
  const normalized = normalizeMetrics(result);
  return { report, result, breakdown, normalized };
}

describe("M4 selfcheck", () => {
  test("1) 纯历史平仓 -> M4 只计历史份额", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.positions.push({ symbol: "AAPL", qty: 100, avgPrice: 10 });
      input.trades.push({
        date: "2024-01-02T10:30:00-05:00",
        side: "SELL",
        symbol: "AAPL",
        qty: 30,
        price: 11,
      });
      input.close.AAPL = { "2024-01-02": 11 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw, intradayRaw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(30, 6);
    expect(round2(intradayRaw)).toBeCloseTo(0, 6);
    expect(breakdown.m4).toHaveLength(1);
    const leg = breakdown.m4[0]!;
    expect(leg.from).toBe("history");
    expect(leg.lotTag).toBe("H");
    expect(leg.isToday).toBe(false);
  });

  test("2) 混合配对（历史 + 今日）必须拆份", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.positions.push({ symbol: "TSLA", qty: 100, avgPrice: 10 });
      input.trades.push(
        {
          date: "2024-01-02T09:45:00-05:00",
          side: "BUY",
          symbol: "TSLA",
          qty: 20,
          price: 12,
        },
        {
          date: "2024-01-02T10:15:00-05:00",
          side: "SELL",
          symbol: "TSLA",
          qty: 120,
          price: 11,
        },
      );
      input.close.TSLA = { "2024-01-02": 11 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw, intradayRaw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(100, 6);
    expect(round2(intradayRaw)).toBeCloseTo(-20, 6);
    const sellLegs = breakdown.all.filter(
      (row) => row.symbol === "TSLA" && row.time.includes("10:15"),
    );
    const fillIds = new Set(sellLegs.map((row) => row.fillId));
    expect(fillIds.size).toBe(1);
    const historyLeg = sellLegs.find((row) => row.into === "M4");
    const todayLeg = sellLegs.find((row) => row.into === "M5.2");
    expect(historyLeg?.from).toBe("history");
    expect(todayLeg?.from).toBe("today");
    expect((historyLeg?.qty ?? 0) + (todayLeg?.qty ?? 0)).toBeCloseTo(120, 6);
  });

  test("3) 纯日内开平 -> M4=0", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.trades.push(
        {
          date: "2024-01-02T09:45:00-05:00",
          side: "BUY",
          symbol: "MSFT",
          qty: 40,
          price: 12,
        },
        {
          date: "2024-01-02T15:30:00-05:00",
          side: "SELL",
          symbol: "MSFT",
          qty: 40,
          price: 11,
        },
      );
      input.close.MSFT = { "2024-01-02": 11 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw, intradayRaw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(0, 6);
    expect(round2(intradayRaw)).toBeCloseTo(-40, 6);
    expect(breakdown.m4.length).toBe(0);
    expect(breakdown.m5_2.every((row) => row.from === "today")).toBe(true);
  });

  test("4) 历史空头部分回补 -> 只计历史空头部分", async () => {
    const { report, result } = await runScenario((input) => {
      input.positions.push({ symbol: "NVDA", qty: -100, avgPrice: 15 });
      input.trades.push({
        date: "2024-01-02T11:00:00-05:00",
        side: "COVER",
        symbol: "NVDA",
        qty: 30,
        price: 14,
      });
      input.close.NVDA = { "2024-01-02": 14 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw, intradayRaw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(30, 6);
    expect(round2(intradayRaw)).toBeCloseTo(0, 6);
  });

  test("5) 分级差校验（先合计后 round）", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.positions.push({ symbol: "QQQ", qty: 3, avgPrice: 9.999 });
      input.trades.push({
        date: "2024-01-02T13:00:00-05:00",
        side: "SELL",
        symbol: "QQQ",
        qty: 3,
        price: 10.001,
      });
      input.close.QQQ = { "2024-01-02": 10.001 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw } = expectRealizedConsistency(result);
    const rawSumFromLegs = sumRaw(breakdown.m4);
    expect(m4Raw).toBeCloseTo(rawSumFromLegs, 10);
    expect(round2(m4Raw)).toBeCloseTo(0.01, 6);
  });

  test("6) 前台读源一致性（聚合层应读取 runAll 覆盖后的 result.M4）", async () => {
    const { report, result, normalized } = await runScenario((input) => {
      input.positions.push({ symbol: "META", qty: 50, avgPrice: 8 });
      input.trades.push({
        date: "2024-01-02T14:00:00-05:00",
        side: "SELL",
        symbol: "META",
        qty: 10,
        price: 9,
      });
      input.close.META = { "2024-01-02": 9 };
    });

    expect(report.ok).toBe(true);
    expect(normalized.M4).toBeCloseTo(result.M4, 6);
    const { m4Raw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(result.M4, 6);
  });

  test("7) 盘后跨日（NY 23:00 成交）仍判定为历史腿", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.evalISO = "2024-01-02";
      input.trades.push(
        {
          date: "2024-01-01T23:30:00-05:00",
          side: "BUY",
          symbol: "IBM",
          qty: 50,
          price: 10,
        },
        {
          date: "2024-01-02T10:00:00-05:00",
          side: "SELL",
          symbol: "IBM",
          qty: 50,
          price: 11,
        },
      );
      input.close.IBM = { "2024-01-02": 11 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(50, 6);
    expect(breakdown.m4.every((leg) => leg.from === "history")).toBe(true);
    expect(breakdown.m4[0]?.lotDateStr).toBe("2024-01-01");
  });

  test("8) 同一 fill 同时吃历史+今日需拆两条腿", async () => {
    const { report, result, breakdown } = await runScenario((input) => {
      input.positions.push({ symbol: "AMZN", qty: 80, avgPrice: 10 });
      input.trades.push(
        {
          date: "2024-01-02T09:50:00-05:00",
          side: "BUY",
          symbol: "AMZN",
          qty: 40,
          price: 9.5,
        },
        {
          date: "2024-01-02T12:00:00-05:00",
          side: "SELL",
          symbol: "AMZN",
          qty: 100,
          price: 11,
        },
      );
      input.close.AMZN = { "2024-01-02": 11 };
    });

    expect(report.ok).toBe(true);
    const { m4Raw } = expectRealizedConsistency(result);
    expect(round2(m4Raw)).toBeCloseTo(80, 6);
    const sellLegs = breakdown.all.filter(
      (row) => row.symbol === "AMZN" && row.time.includes("12:00"),
    );
    const fillIds = new Set(sellLegs.map((row) => row.fillId));
    expect(fillIds.size).toBe(1);
    expect(sellLegs.filter((row) => row.into === "M4").length).toBe(1);
    expect(
      sellLegs.filter((row) => row.into && row.into.startsWith("M5")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      sellLegs.filter((row) => row.into === "M4").every((row) => row.from === "history"),
    ).toBe(true);
    expect(
      sellLegs
        .filter((row) => row.into && row.into.startsWith("M5"))
        .every((row) => row.from === "today"),
    ).toBe(true);
  });
});

