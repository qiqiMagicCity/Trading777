import { calcWtdMtdYtdFromSnapshots } from "../metrics";

type DailyResult = {
  date: string;
  realized?: number | null;
  unrealized?: number | null;
  unrealizedDelta?: number | null;
};

type GroundTruthResult = {
  value: number;
  degraded: boolean;
};

function groundTruthWindowPnL(
  results: DailyResult[],
  windowStart: string,
  evalDay: string,
): GroundTruthResult {
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));

  const withinWindow = sorted.filter(
    (item) => item.date >= windowStart && item.date <= evalDay,
  );

  const realizedSum = withinWindow.reduce(
    (sum, item) => sum + (typeof item.realized === "number" ? item.realized : 0),
    0,
  );

  let endUnrealized = 0;
  for (const item of sorted) {
    if (item.date > evalDay) {
      break;
    }
    if (typeof item.unrealized === "number") {
      endUnrealized = item.unrealized;
    }
  }

  let baseline: number | undefined;
  for (const item of sorted) {
    if (item.date >= windowStart) {
      break;
    }
    if (typeof item.unrealized === "number") {
      baseline = item.unrealized;
    }
  }

  if (baseline === undefined) {
    const firstInWindow = withinWindow[0];
    if (
      firstInWindow &&
      typeof firstInWindow.unrealized === "number" &&
      typeof firstInWindow.unrealizedDelta === "number"
    ) {
      baseline = firstInWindow.unrealized - firstInWindow.unrealizedDelta;
    }
  }

  if (baseline === undefined) {
    const deltaSum = withinWindow.reduce(
      (sum, item) =>
        sum + (typeof item.unrealizedDelta === "number" ? item.unrealizedDelta : 0),
      0,
    );
    return {
      value: realizedSum + deltaSum,
      degraded: true,
    };
  }

  return {
    value: realizedSum + (endUnrealized - baseline),
    degraded: false,
  };
}

describe("[DIAG M11] Diagnose calcWtdMtdYtdFromSnapshots", () => {
  it("Case1 粘连风险场景", () => {
    const drs1: DailyResult[] = [
      { date: "2025-09-02", realized: 5, unrealized: 90, unrealizedDelta: 10 },
      { date: "2025-09-03", realized: 0, unrealized: 95, unrealizedDelta: 5 },
      { date: "2025-09-05", realized: 7, unrealized: 110, unrealizedDelta: 10 },
    ];
    const eval1 = "2025-09-05";

    const actual = calcWtdMtdYtdFromSnapshots(drs1, eval1);
    const truthW = groundTruthWindowPnL(drs1, "2025-09-01", eval1);
    const truthM = groundTruthWindowPnL(drs1, "2025-09-01", eval1);
    const truthY = groundTruthWindowPnL(drs1, "2025-01-01", eval1);

    expect(actual.wtd).toBeCloseTo(truthW.value, 6);
    expect(actual.mtd).toBeCloseTo(truthM.value, 6);
    expect(actual.ytd).toBeCloseTo(truthY.value, 6);
    expect(actual.degraded.wtd).toBe(truthW.degraded);
    expect(actual.degraded.mtd).toBe(truthM.degraded);
    expect(actual.degraded.ytd).toBe(truthY.degraded);
  });

  it("Case2 仅有评估日一行", () => {
    const drs2: DailyResult[] = [
      { date: "2025-09-06", realized: 3, unrealized: 40, unrealizedDelta: 4 },
    ];
    const eval2 = "2025-09-06";

    const actual = calcWtdMtdYtdFromSnapshots(drs2, eval2);
    const truthW = groundTruthWindowPnL(drs2, "2025-09-01", eval2);
    const truthM = groundTruthWindowPnL(drs2, "2025-09-01", eval2);
    const truthY = groundTruthWindowPnL(drs2, "2025-01-01", eval2);

    expect(actual.wtd).toBeCloseTo(truthW.value, 6);
    expect(actual.mtd).toBeCloseTo(truthM.value, 6);
    expect(actual.ytd).toBeCloseTo(truthY.value, 6);
    expect(actual.degraded.wtd).toBe(truthW.degraded);
    expect(actual.degraded.mtd).toBe(truthM.degraded);
    expect(actual.degraded.ytd).toBe(truthY.degraded);
  });

  it("Case3 有ΔU可反推基线", () => {
    const drs3: DailyResult[] = [
      { date: "2025-09-02", realized: 10, unrealized: 100, unrealizedDelta: 5 },
      { date: "2025-09-04", realized: 0, unrealized: 102, unrealizedDelta: 2 },
    ];
    const eval3 = "2025-09-04";

    const actual = calcWtdMtdYtdFromSnapshots(drs3, eval3);
    const truthW = groundTruthWindowPnL(drs3, "2025-09-01", eval3);
    const truthM = groundTruthWindowPnL(drs3, "2025-09-01", eval3);
    const truthY = groundTruthWindowPnL(drs3, "2025-01-01", eval3);

    expect(actual.wtd).toBeCloseTo(truthW.value, 6);
    expect(actual.mtd).toBeCloseTo(truthM.value, 6);
    expect(actual.ytd).toBeCloseTo(truthY.value, 6);
    expect(actual.degraded.wtd).toBe(truthW.degraded);
    expect(actual.degraded.mtd).toBe(truthM.degraded);
    expect(actual.degraded.ytd).toBe(truthY.degraded);
  });
});

export { groundTruthWindowPnL };
