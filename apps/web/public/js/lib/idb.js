/**
 * idb.js - IndexedDB wrapper for Trading777 v7.20
 */
const DB_NAME = 'TradingApp';
const DB_VERSION = 1;
const STORE_PRICES = 'prices';

function _open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PRICES)) {
        const store = db.createObjectStore(STORE_PRICES, { keyPath: 'id' });
        store.createIndex('bySymbol', 'symbol', { unique: false });
        store.createIndex('byDate', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const dbPromise = _open();

/**
 * Put or overwrite a daily close price.
 * @param {string} symbol
 * @param {string} date YYYY-MM-DD
 * @param {number} close
 * @param {string} source
 */
export async function putPrice(symbol, date, close, source = 'finnhub') {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRICES, 'readwrite');
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_PRICES).put({
      id: `${symbol}_${date}`,
      symbol,
      date,
      close,
      source,
      fetchedAt: Date.now()
    });
  });
}

/**
 * Get a stored close price.
 * @param {string} symbol
 * @param {string} date YYYY-MM-DD
 */
export async function getPrice(symbol, date) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRICES, 'readonly');
    const req = tx.objectStore(STORE_PRICES).get(`${symbol}_${date}`);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Export all stored prices as a downloadable JSON file.
 */
export async function exportPrices() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRICES, 'readonly');
    const req = tx.objectStore(STORE_PRICES).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const blob = new Blob([JSON.stringify(req.result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.download = `prices_${today}.json`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    };
  });
}