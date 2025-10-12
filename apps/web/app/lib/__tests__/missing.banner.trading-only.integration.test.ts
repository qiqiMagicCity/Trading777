import { buildMissingCloseList } from "@/app/lib/dailyResults";
import { isTradingDay } from "@/app/lib/nyDay";

describe("missing close banner uses trading days only", () => {
  const originalFreeze = process.env.NEXT_PUBLIC_FREEZE_DATE;

  afterEach(() => {
    if (originalFreeze === undefined) {
      delete process.env.NEXT_PUBLIC_FREEZE_DATE;
    } else {
      process.env.NEXT_PUBLIC_FREEZE_DATE = originalFreeze;
    }
  });

  test("weekend is excluded", async () => {
    const entries = [
      { symbol: "AAPL", ymd: "2025-10-05", fallback: "MARK_PRICE" as const },
      { symbol: "AAPL", ymd: "2025-10-06", fallback: "MARK_PRICE" as const },
    ];
    const list = await buildMissingCloseList({
      from: "2025-10-04",
      to: "2025-10-06",
      entries,
    });
    expect(list.some((x) => x.ymd === "2025-10-05")).toBe(false);
    expect(list.some((x) => x.ymd === "2025-10-06")).toBe(true);
  });

  test("holiday is excluded", async () => {
    const entries = [
      { symbol: "MSFT", ymd: "2025-12-25", fallback: "MARK_PRICE" as const },
      { symbol: "MSFT", ymd: "2025-12-26", fallback: "MARK_PRICE" as const },
    ];
    const list = await buildMissingCloseList({
      from: "2025-12-24",
      to: "2025-12-27",
      entries,
    });
    expect(list.some((x) => x.ymd === "2025-12-25")).toBe(false);
    expect(list.some((x) => x.ymd === "2025-12-26")).toBe(true);
  });

  test("trading day entries preserve trading ymd", async () => {
    const entries = [
      { symbol: "TSLA", ymd: "2025-10-06", fallback: "AVERAGE_COST" as const },
      { symbol: "TSLA", ymd: "2025-10-07", fallback: "MARK_PRICE" as const },
    ];
    const list = await buildMissingCloseList({
      from: "2025-10-06",
      to: "2025-10-07",
      entries,
    });
    expect(list.every((x) => isTradingDay(x.ymd))).toBe(true);
    expect(list.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.ymd))).toBe(true);
  });

  test("freeze weekend entries do not leak weekends", async () => {
    process.env.NEXT_PUBLIC_FREEZE_DATE = "2025-10-05";
    const entries = [
      { symbol: "QQQ", ymd: "2025-10-03", fallback: "MARK_PRICE" as const },
      { symbol: "QQQ", ymd: "2025-10-05", fallback: "AVERAGE_COST" as const },
      { symbol: "QQQ", ymd: "2025-10-06", fallback: "MARK_PRICE" as const },
    ];
    const list = await buildMissingCloseList({
      from: "2025-10-03",
      to: "2025-10-06",
      entries,
    });
    expect(list.some((x) => x.ymd === "2025-10-05")).toBe(false);
    expect(list.some((x) => x.ymd === "2025-10-03")).toBe(true);
    expect(list.some((x) => x.ymd === "2025-10-06")).toBe(true);
  });
});
