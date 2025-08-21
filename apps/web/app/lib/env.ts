export const isBrowser = typeof window !== 'undefined';

export function safeLocalStorage(): Storage | null {
  if (!isBrowser) return null;
  try { return window.localStorage; } catch { return null; }
}

export function lsGet(key: string): string | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try { return ls.getItem(key); } catch { return null; }
}

export function lsSet(key: string, val: string): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try { ls.setItem(key, val); } catch {}
}

export const ENV = {
  FINNHUB_API_KEY: process?.env?.FINNHUB_API_KEY ?? '',
  TIINGO_API_KEY : process?.env?.TIINGO_API_KEY ?? '',
};

