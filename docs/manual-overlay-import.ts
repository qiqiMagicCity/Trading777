// seed-overlay manual import helper
// Usage: paste into browser console when running Trading777 dashboard.
// Ensures close_prices_version refreshes after overlay seeding.

interface OverlayRow {
  symbol: string;
  date: string;
  price: number;
  source?: string;
}

const DB_NAME = "TradingOfficialCloseOverlay";
const STORE_NAME = "overlays";

async function openOverlayDb(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME);
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function seedOverlayRows(rows: OverlayRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await openOverlayDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const completion = new Promise<void>((resolve, reject) => {
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
  const st = tx.objectStore(STORE_NAME);

  async function put(row: OverlayRow): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = st.put({
        ...row,
        source: row.source ?? "official_overlay",
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  for (const row of rows) {
    const keyPath = st.keyPath;
    const keyPathList =
      keyPath && typeof keyPath === "object" && "length" in keyPath
        ? Array.from(keyPath as DOMStringList)
        : null;

    if (keyPathList) {
      await put(row);
      continue;
    }

    if (Array.isArray(keyPath)) {
      await put(row);
      continue;
    }

    if (typeof keyPath === "string" && keyPath.length > 0) {
      if ((row as Record<string, unknown>)[keyPath] == null) {
        const randomId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        (row as Record<string, unknown>)[keyPath] = randomId;
      }
      await put(row);
      continue;
    }

    await put(row);
  }

  await completion;
  db.close();

  try {
    const stamp = String(Date.now());
    localStorage.setItem("close_prices_version", stamp);
  } catch (error) {
    console.warn("close_prices_version refresh failed", error);
  }
}

// Example invocation:
// await seedOverlayRows([{ symbol: "AAPL", date: "2024-01-03", price: 189.12 }]);

export { seedOverlayRows };
