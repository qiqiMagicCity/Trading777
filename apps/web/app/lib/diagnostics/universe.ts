import { previousTradingDay, resolveTradingDayStr } from "@/app/lib/nyDay";

function normalizeSymbol(symbol: string | null | undefined) {
  if (!symbol) return null;
  const trimmed = String(symbol).trim().toUpperCase();
  if (!trimmed) return null;
  if (!/^[A-Z0-9.-]{1,12}$/.test(trimmed)) return null;
  return trimmed;
}

async function collectFromIndexedDb(storeName: string, key: string): Promise<string[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  return new Promise((resolve) => {
    const request = window.indexedDB.open(storeName);
    request.onsuccess = () => {
      try {
        const db = request.result;
        const tx = db.transaction(key, 'readonly');
        const objectStore = tx.objectStore(key);
        if (!objectStore.getAll) {
          db.close();
          resolve([]);
          return;
        }
        const getAllRequest = objectStore.getAll();
        getAllRequest.onsuccess = () => {
          const results = Array.isArray(getAllRequest.result) ? getAllRequest.result : [];
          const collected: string[] = [];
          for (const item of results) {
            if (item && typeof item === 'object' && 'symbol' in item) {
              const normalized = normalizeSymbol((item as { symbol?: string }).symbol);
              if (normalized) {
                collected.push(normalized);
              }
            }
          }
          db.close();
          resolve(collected);
        };
        getAllRequest.onerror = () => {
          db.close();
          resolve([]);
        };
      } catch (error) {
        console.warn('collectFromIndexedDb failed', storeName, error);
        resolve([]);
      }
    };
    request.onerror = () => resolve([]);
  });
}

export async function collectSymbols(): Promise<string[]> {
  const symbols = new Set<string>();
  const [positionSymbols, overlaySymbols] = await Promise.all([
    collectFromIndexedDb('TradingApp', 'positions'),
    collectFromIndexedDb('TradingOfficialCloseOverlay', 'overlays'),
  ]);
  for (const symbol of positionSymbols) symbols.add(symbol);
  for (const symbol of overlaySymbols) symbols.add(symbol);

  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    try {
      const response = await window.fetch(`/close_prices.json?v=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) {
        const raw = await response.json();
        if (raw && typeof raw === 'object') {
          for (const key of Object.keys(raw)) {
            const normalized = normalizeSymbol(key);
            if (normalized) {
              symbols.add(normalized);
            }
          }
        }
      }
    } catch (error) {
      console.warn('collectSymbols fallback fetch failed', error);
    }
  }

  return Array.from(symbols);
}

export async function collectUniverse(kind: 'E' | 'E-1' | 'both') {
  const today = resolveTradingDayStr();
  const prev = previousTradingDay(today);
  const symbols = await collectSymbols();
  const dates =
    kind === 'E'
      ? [today]
      : kind === 'E-1'
        ? prev
          ? [prev]
          : []
        : prev
          ? [prev, today]
          : [today];
  return { dates, symbols };
}
