import "fake-indexeddb/auto";
import { openDB } from "idb";
import {
  importData,
  clearAndImportData,
  closeDb,
  DATASET_HASH_KEY,
  DATASET_SOURCE_KEY,
  DATASET_SOURCE_CUSTOM,
  DATASET_SOURCE_BUILTIN,
  hashPayload,
  getAnyTradeCount,
} from "./dataService";
import type { RawTrade, Position, Trade } from "./dataService";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";
import { BUILTIN_DATASET } from "@/data/builtin";

function createMemoryStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  } satisfies Storage;
}

describe("dataService trade import", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    Object.defineProperty(global, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error cleanup for node test env
    delete global.localStorage;
  });

  test("importData skips malformed trades without aborting", async () => {
    const rawData: { positions: Position[]; trades: RawTrade[] } = {
      positions: [],
      trades: [
        {
          date: "2025-01-01",
          symbol: "AAPL",
          side: "BUY",
          qty: 10,
          price: 100,
        },
        {
          date: "2025-01-02",
          symbol: "MSFT",
          side: "INVALID" as unknown as RawTrade["side"],
          qty: 5,
          price: 200,
        },
        { date: "2025-01-03", symbol: "TSLA", qty: 3, price: 300 } as unknown as RawTrade,
        {
          date: "2025-01-04",
          symbol: "GOOG",
          side: "SELL",
          qty: 2,
          price: 150,
        },
      ],
    };

    await importData(rawData);
    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();
    expect(trades).toHaveLength(2);
  });

  test("clearAndImportData skips malformed trades", async () => {
    const rawData: { positions: Position[]; trades: RawTrade[] } = {
      positions: [],
      trades: [
        {
          date: "2025-02-01",
          symbol: "MSFT",
          side: "INVALID" as unknown as RawTrade["side"],
          qty: 1,
          price: 200,
        },
        {
          date: "2025-02-02",
          symbol: "GOOG",
          side: "SELL",
          qty: 1,
          price: 150,
        },
      ],
    };

    await clearAndImportData(rawData);
    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "GOOG", action: "sell" });
  });

  test("clearAndImportData accepts exported trade format", async () => {
    const exportedTrade: Trade = {
      id: 99,
      symbol: "TSLA",
      price: 725,
      quantity: 2,
      date: "2025-02-10",
      action: "sell",
      time: "10:30",
    };

    await clearAndImportData({ positions: [], trades: [exportedTrade] });
    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: "TSLA",
      action: "sell",
      quantity: 2,
    });
  });

  // --- 回归：接受“富含元数据”的备份载荷（含字符串数值、action/quantity 等别名） ---
  test("clearAndImportData accepts metadata rich backup payload", async () => {
    const payload = {
      positions: [],
      trades: [
        {
          symbol: "TSDD",
          price: 11.04,
          quantity: 10000,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:18:31",
          id: 26,
        },
        {
          symbol: "BA",
          price: "216.27",
          quantity: "350",
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:20:03",
          id: 27,
        },
        {
          symbol: "GOOGL",
          price: 170.73,
          quantity: 400,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:20:27",
          id: 28,
        },
        {
          symbol: "AMD",
          price: 151.72,
          quantity: 380,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:20:57",
          id: 29,
        },
        {
          symbol: "PYPL",
          price: 68.54,
          quantity: 555,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:21:20",
          id: 30,
        },
        {
          symbol: "UAL",
          price: 103.7,
          quantity: 300,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:21:39",
          id: 31,
        },
        {
          symbol: "DIS",
          price: 116.83,
          quantity: 250,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:21:59",
          id: 32,
        },
        {
          symbol: "NVDL",
          price: 84.12,
          quantity: 330,
          date: "2025-05-23",
          action: "buy" as const,
          time: "2025-05-23T05:22:24",
          id: 33,
        },
      ],
      equityCurve: [],
      generated: "2025-09-23T10:15:01.450Z",
    } as const;

    await clearAndImportData(payload as any);

    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();

    expect(trades).toHaveLength(8);
    const baTrade = trades.find((t) => t.symbol === "BA");
    expect(baTrade).toMatchObject({
      action: "buy",
      quantity: 350,
      price: 216.27,
      time: "2025-05-23T05:20:03",
    });
    const tsddTrade = trades.find((t) => t.symbol === "TSDD");
    expect(tsddTrade).toMatchObject({
      quantity: 10000,
      action: "buy",
      date: "2025-05-23",
    });
  });

  test("clearAndImportData normalizes common broker action aliases", async () => {
    const payload = {
      positions: [],
      trades: [
        {
          symbol: "ALIAS1",
          price: 10,
          quantity: 1,
          date: "2025-07-01",
          action: "BTO",
        },
        {
          symbol: "ALIAS1",
          price: 12,
          quantity: 1,
          date: "2025-07-02",
          action: "STC",
        },
        {
          symbol: "ALIAS2",
          price: 25,
          quantity: 5,
          date: "2025-07-03",
          side: "SELL_SHORT",
        },
        {
          symbol: "ALIAS2",
          price: 20,
          quantity: 5,
          date: "2025-07-04",
          action: "BTC",
        },
      ],
    } as const;

    await clearAndImportData(payload as any);

    const db = await openDB("TradingApp", 3);
    const trades = await db.getAll("trades");
    db.close();

    expect(trades).toHaveLength(4);
    expect(trades.find((t) => t.symbol === "ALIAS1" && t.date === "2025-07-01"))
      .toMatchObject({ action: "buy", quantity: 1 });
    expect(trades.find((t) => t.symbol === "ALIAS1" && t.date === "2025-07-02"))
      .toMatchObject({ action: "sell", quantity: 1 });
    expect(trades.find((t) => t.symbol === "ALIAS2" && t.date === "2025-07-03"))
      .toMatchObject({ action: "short", quantity: -5 });
    expect(trades.find((t) => t.symbol === "ALIAS2" && t.date === "2025-07-04"))
      .toMatchObject({ action: "cover", quantity: 5 });
  });

  test("clearAndImportData stores dataset hash", async () => {
    const rawData = {
      positions: [],
      trades: [
        {
          date: "2025-03-01",
          symbol: "AAPL",
          side: "BUY" as const,
          qty: 1,
          price: 100,
        },
      ],
    };

    const expectedHash = hashPayload(rawData);

    await clearAndImportData(rawData);
    expect(global.localStorage.getItem(DATASET_HASH_KEY)).toBe(expectedHash);
    expect(global.localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_BUILTIN,
    );
  });

  test("importData stores dataset hash and marks builtin source", async () => {
    const rawData: { positions: Position[]; trades: RawTrade[] } = {
      positions: [],
      trades: [
        {
          date: "2025-05-01",
          symbol: "AAPL",
          side: "BUY",
          qty: 1,
          price: 123,
        },
      ],
    };

    const expectedHash = hashPayload(rawData);

    await importData(rawData);

    expect(global.localStorage.getItem(DATASET_HASH_KEY)).toBe(expectedHash);
    expect(global.localStorage.getItem(DATASET_SOURCE_KEY)).toBe(
      DATASET_SOURCE_CUSTOM,
    );
  });

  test("importData enforces negative quantity for short trades and positions", async () => {
    const rawData = {
      positions: [
        { symbol: "AMZN", qty: -80, avgPrice: 10, last: 10, priceOk: true },
      ],
      trades: [
        {
          date: "2025-04-01",
          symbol: "AMZN",
          side: "SHORT" as const,
          qty: 80,
          price: 10,
        },
      ],
    };
    await importData(rawData);
    const db = await openDB("TradingApp", 3);
    const [trade] = await db.getAll("trades");
    const [position] = await db.getAll("positions");
    db.close();
    expect(trade.quantity).toBe(-80);
    expect(position.qty).toBe(-80);
  });
});

describe("dataset bootstrap guard", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
    Object.defineProperty(global, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
    });
  });

  afterEach(async () => {
    await closeDb();
    // @ts-expect-error cleanup for node test env
    delete global.localStorage;
  });

  it("keeps custom dataset across bootstrap reload", async () => {
    await clearAndImportData(BUILTIN_DATASET as any);

    const custom = {
      positions: [],
      trades: [
        { symbol: "TSDD", price: 11.04, quantity: 10000, date: "2025-05-23", action: "buy", time: "2025-05-23T05:18:31" },
        { symbol: "BA", price: 216.27, quantity: 350, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:03" },
        { symbol: "GOOGL", price: 170.73, quantity: 400, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:27" },
        { symbol: "AMD", price: 151.72, quantity: 380, date: "2025-05-23", action: "buy", time: "2025-05-23T05:20:57" },
        { symbol: "PYPL", price: 68.54, quantity: 555, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:20" },
        { symbol: "UAL", price: 103.7, quantity: 300, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:39" },
        { symbol: "DIS", price: 116.83, quantity: 250, date: "2025-05-23", action: "buy", time: "2025-05-23T05:21:59" },
        { symbol: "NVDL", price: 84.12, quantity: 330, date: "2025-05-23", action: "buy", time: "2025-05-23T05:22:24" },
      ],
    };

    await importData(custom);
    expect(await getAnyTradeCount()).toBe(8);

    await ensureBuiltInDatasetLoaded();

    expect(await getAnyTradeCount()).toBe(8);
    expect(localStorage.getItem(DATASET_SOURCE_KEY)).toBe(DATASET_SOURCE_CUSTOM);
  });
});
