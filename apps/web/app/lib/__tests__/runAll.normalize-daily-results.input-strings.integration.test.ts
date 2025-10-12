import { runAll } from "../runAll";
import type { RawTrade } from "../runAll";
import type { DailyResult } from "../types";
import * as metrics from "../metrics";

describe("runAllCore normalizes imported daily snapshots", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("在调用 calcMetrics 前会将字符串字段转为数字", async () => {
    const evalDate = "2025-04-11";
    const stringDaily = [
      {
        date: "2025-04-10T16:00:00-04:00",
        realized: "100.5",
        unrealized: "-250.125",
        unrealizedDelta: "5.25",
      },
      {
        date: "2025-04-11T16:00:00-04:00",
        realized: "-40.75",
        unrealized: "300.5",
        unrealizedDelta: "1.5",
      },
    ];

    const numericDaily: DailyResult[] = [
      {
        date: "2025-04-10T16:00:00-04:00",
        realized: 100.5,
        unrealized: -250.125,
        unrealizedDelta: 5.25,
      },
      {
        date: "2025-04-11T16:00:00-04:00",
        realized: -40.75,
        unrealized: 300.5,
        unrealizedDelta: 1.5,
      },
    ];

    const originalCalcMetrics = metrics.calcMetrics;
    const calcMetricsSpy = jest
      .spyOn(metrics, "calcMetrics")
      .mockImplementation((trades, positions, daily, options) => {
        expect(Array.isArray(daily)).toBe(true);
        for (const row of daily) {
          expect(typeof row.realized).toBe("number");
          expect(typeof row.unrealized).toBe("number");
          if (row.unrealizedDelta !== undefined) {
            expect(typeof row.unrealizedDelta).toBe("number");
          }
        }
        return originalCalcMetrics(trades, positions, daily, options);
      });

    const resultFromStrings = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults: stringDaily as unknown as DailyResult[] },
      { evalDate },
    );

    const resultFromNumbers = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults: numericDaily },
      { evalDate },
    );

    calcMetricsSpy.mockRestore();

    expect(resultFromStrings.M11).toBe(resultFromNumbers.M11);
    expect(resultFromStrings.M12).toBe(resultFromNumbers.M12);
    expect(resultFromStrings.M13).toBe(resultFromNumbers.M13);
    expect(resultFromStrings._period?.diagnostics?.wtd?.parseErrors).toBeUndefined();
  });

  it("当字符串含有千分位时会透出解析失败", async () => {
    const evalDate = "2025-04-12";
    const dailyResults = [
      {
        date: "2025-04-11T16:00:00-04:00",
        realized: "1,200",
        unrealized: "305.5",
        unrealizedDelta: "2.5",
      },
      {
        date: "2025-04-12T16:00:00-04:00",
        realized: "30.5",
        unrealized: "308",
        unrealizedDelta: "1.25",
      },
    ];

    const result = await runAll(
      evalDate,
      [],
      [] as RawTrade[],
      {},
      { dailyResults: dailyResults as unknown as DailyResult[] },
      { evalDate },
    );

    const parseErrors = result._period?.diagnostics?.wtd?.parseErrors ?? [];
    expect(parseErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "realized", value: "1,200" }),
      ]),
    );
    expect(result._period?.diagnostics?.wtd?.reason).toBe("DEGEN_PARSE_FAILED");
    expect(result._period?.degraded?.wtd).toBe(true);
  });
});
