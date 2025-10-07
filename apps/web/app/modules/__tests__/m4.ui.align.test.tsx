import { runAll, type RawTrade } from "@/app/lib/runAll";
import type { InitialPosition } from "@/app/lib/fifo";
import { normalizeMetrics } from "@/app/lib/metrics";
import { round2 } from "@/app/lib/money";

type Scenario = {
  evalISO: string;
  positions: InitialPosition[];
  trades: RawTrade[];
  close: Record<string, Record<string, number>>;
  dailyResults: Array<{ date: string; realized: number; unrealized?: number }>;
  options: { evalDate?: Date };
};

type RunResult = Awaited<ReturnType<typeof runAll>>;

type BreakdownRow = {
  into?: string;
  pnl_raw?: number;
};

function baseScenario(): Scenario {
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

function extractM4Legs(result: RunResult): BreakdownRow[] {
  const breakdown = (result as any)?.aux?.breakdown;
  if (Array.isArray(breakdown?.m4)) return breakdown.m4 as BreakdownRow[];
  if (Array.isArray(breakdown?.all)) {
    return (breakdown.all as BreakdownRow[]).filter((row) => row?.into === "M4");
  }
  if (Array.isArray(breakdown)) {
    return (breakdown as BreakdownRow[]).filter((row) => row?.into === "M4");
  }
  return [];
}

describe("M4 frontend alignment", () => {
  test("normalizeMetrics(M4) equals runAll().M4", async () => {
    const scenario = baseScenario();
    scenario.positions.push({ symbol: "AAPL", qty: 100, avgPrice: 10 });
    scenario.trades.push({
      date: "2024-01-02T10:30:00-05:00",
      side: "SELL",
      symbol: "AAPL",
      qty: 30,
      price: 11,
    });
    scenario.close.AAPL = { "2024-01-02": 11 };

    const args = buildArgs(scenario);
    const result = await runAll(...args);
    const metrics = normalizeMetrics(result);

    expect(round2(metrics.M4)).toBeCloseTo(round2(result.M4 as number), 6);
  });

  test("sum of aux.breakdown.m4 pnl_raw equals result.M4 (±$0.01)", async () => {
    const scenario = baseScenario();
    scenario.positions.push({ symbol: "TSLA", qty: 100, avgPrice: 10 });
    scenario.trades.push(
      {
        date: "2024-01-02T09:45:00-05:00",
        side: "BUY",
        symbol: "TSLA",
        qty: 20,
        price: 12,
      },
      {
        date: "2024-01-02T13:30:00-05:00",
        side: "SELL",
        symbol: "TSLA",
        qty: 50,
        price: 11,
      },
    );
    scenario.close.TSLA = { "2024-01-02": 11 };

    const args = buildArgs(scenario);
    const result = await runAll(...args);
    const legs = extractM4Legs(result);
    const sumRaw = round2(legs.reduce((acc, leg) => acc + Number(leg.pnl_raw ?? 0), 0));
    const reported = round2(Number(result.M4 ?? 0));

    expect(Math.abs(sumRaw - reported)).toBeLessThanOrEqual(0.01);
  });
});
