import "fake-indexeddb/auto";
import { openDB } from "idb";
import { importData, clearAndImportData, closeDb } from "./dataService";
import { createHash } from "crypto";

describe("dataService trade import", () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase("TradingApp");
  });

  afterEach(async () => {
    await closeDb();
  });

  test("importData skips malformed trades without aborting", async () => {
    const rawData: any = {
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
          side: "INVALID" as any,
          qty: 5,
          price: 200,
        },
        { date: "2025-01-03", symbol: "TSLA", qty: 3, price: 300 },
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
    const rawData: any = {
      positions: [],
      trades: [
        {
          date: "2025-02-01",
          symbol: "MSFT",
          side: "INVALID" as any,
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

    const expectedHash = createHash("sha256")
      .update(JSON.stringify(rawData))
      .digest("hex");

    const store: Record<string, string> = {};
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = String(value);
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      },
      configurable: true,
    });

    await clearAndImportData(rawData);
    expect(global.localStorage.getItem("dataset-hash")).toBe(expectedHash);
    // cleanup
    // @ts-ignore
    delete global.localStorage;
  });

  test("importData enforces negative quantity for short trades and positions", async () => {
    const rawData = {
      positions: [
        { symbol: "AMZN", qty: 80, avgPrice: 10, last: 10, priceOk: true },
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
