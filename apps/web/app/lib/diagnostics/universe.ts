import { getLatestTradingDayStr } from "@/app/lib/timezone";
import { previousTradingDay } from "@/app/lib/nyDay";

async function readAllFromStore(dbName: string, storeName: string): Promise<unknown[]> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = database.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    if (typeof store.getAll !== "function") {
      return [];
    }
    return await new Promise<unknown[]>((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    });
  } finally {
    database.close();
  }
}

function logWarning(context: string, error: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(context, error);
  }
}

// 获取页面上下文可见的符号集：positions、overlay、观察列表（尽量覆盖）
export async function collectSymbols(): Promise<string[]> {
  const symbols = new Set<string>();
  const hasIndexedDb = typeof indexedDB !== "undefined";
  if (hasIndexedDb) {
    try {
      const entries = await readAllFromStore("TradingApp", "positions");
      for (const entry of entries) {
        const symbol = typeof entry === "object" && entry && "symbol" in entry
          ? String((entry as Record<string, unknown>).symbol ?? "")
          : "";
        if (symbol) {
          symbols.add(symbol.toUpperCase());
        }
      }
    } catch (error) {
      logWarning("collectSymbols: positions read failed", error);
    }

    try {
      const overlays = await readAllFromStore("TradingOfficialCloseOverlay", "overlays");
      for (const entry of overlays) {
        const symbol = typeof entry === "object" && entry && "symbol" in entry
          ? String((entry as Record<string, unknown>).symbol ?? "")
          : "";
        if (symbol) {
          symbols.add(symbol.toUpperCase());
        }
      }
    } catch (error) {
      logWarning("collectSymbols: overlay read failed", error);
    }
  }

  // 兜底：从 packaged 拉一遍 keys
  try {
    const response = await fetch(`/close_prices.json?v=${Date.now()}`, { cache: "no-store" });
    if (response.ok) {
      const raw: unknown = await response.json();
      if (raw && typeof raw === "object") {
        for (const key of Object.keys(raw as Record<string, unknown>)) {
          if (/^[A-Z0-9.-]{1,12}$/.test(key)) {
            symbols.add(key.toUpperCase());
          }
        }
      }
    }
  } catch (error) {
    logWarning("collectSymbols: packaged fetch failed", error);
  }

  return Array.from(symbols);
}

export async function collectUniverse(kind: "E" | "E-1" | "both") {
  const tradeDay = getLatestTradingDayStr();
  const previous = previousTradingDay(tradeDay) || tradeDay;
  const symbols = await collectSymbols();
  const dates =
    kind === "E" ? [tradeDay] : kind === "E-1" ? [previous] : [previous, tradeDay];
  return { dates, symbols };
}
