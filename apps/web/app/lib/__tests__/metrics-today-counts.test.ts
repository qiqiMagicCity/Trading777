import { calcMetrics, normalizeMetrics } from "@/app/lib/metrics";

const FREEZE_KEY = "NEXT_PUBLIC_FREEZE_DATE";

describe("calcMetrics daily trade detection", () => {
  const originalFreeze = process.env[FREEZE_KEY];

  beforeEach(() => {
    process.env[FREEZE_KEY] = "2024-05-01";
  });

  afterEach(() => {
    if (originalFreeze === undefined) {
      delete process.env[FREEZE_KEY];
    } else {
      process.env[FREEZE_KEY] = originalFreeze;
    }
  });

  it("counts trades as today even when only time-of-day is provided", () => {
    const trades = [
      {
        symbol: "AAPL",
        action: "buy",
        quantity: 100,
        price: 120,
        date: "2024-05-01",
        time: "09:35",
      },
      {
        symbol: "AAPL",
        action: "sell",
        quantity: 100,
        price: 121,
        date: "2024-05-01",
        time: "15:00",
      },
    ];

    const metrics = normalizeMetrics(calcMetrics(trades as any, [], []));

    expect(metrics.M7.B).toBe(1);
    expect(metrics.M7.S).toBe(1);
    expect(metrics.M7.total).toBe(2);
    expect(metrics.M5.behavior).toBeCloseTo(100, 5);
  });
});
