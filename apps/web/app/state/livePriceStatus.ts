const LIVE_QUOTE_EVENT = "liveQuoteArrived" as const;
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes window

export interface LiveQuoteEventDetail {
  symbol: string;
  ts: number;
}

type Listener = (detail: LiveQuoteEventDetail) => void;

const listeners = new Set<Listener>();
const listenerMap = new Map<Listener, (event: Event) => void>();
const liveQuoteMap = new Map<string, number>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function notifyListeners(detail: LiveQuoteEventDetail): void {
  if (listeners.size === 0) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(detail);
    } catch (error) {
      console.error("[livePriceStatus] listener failed", error);
    }
  }
}

export function recordLiveQuote(symbol: string, ts: number): void {
  if (typeof symbol !== "string" || !symbol.trim()) {
    return;
  }
  const normalized = normalizeSymbol(symbol);
  liveQuoteMap.set(normalized, ts);
  const detail: LiveQuoteEventDetail = { symbol: normalized, ts };
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(LIVE_QUOTE_EVENT, { detail }));
    } catch (error) {
      console.warn("[livePriceStatus] dispatch failed", error);
    }
  } else {
    notifyListeners(detail);
  }
}

export function hasLivePriceFor(symbol: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  if (typeof symbol !== "string") return false;
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return false;
  const ts = liveQuoteMap.get(normalized);
  if (typeof ts !== "number" || Number.isNaN(ts)) {
    return false;
  }
  const now = Date.now();
  return now - ts <= Math.max(2 * 60 * 1000, Math.min(ttlMs, 5 * 60 * 1000));
}

export function subscribeLivePriceTick(listener: Listener): void {
  if (listeners.has(listener)) return;
  listeners.add(listener);
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<LiveQuoteEventDetail>;
      if (!custom.detail) return;
      listener(custom.detail);
    };
    listenerMap.set(listener, handler);
    window.addEventListener(LIVE_QUOTE_EVENT, handler as EventListener);
  }
}

export function unsubscribeLivePriceTick(listener: Listener): void {
  listeners.delete(listener);
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    const handler = listenerMap.get(listener);
    if (handler) {
      window.removeEventListener(LIVE_QUOTE_EVENT, handler as EventListener);
      listenerMap.delete(listener);
    }
  }
}

export function __resetLivePriceStatusForTests(): void {
  liveQuoteMap.clear();
  listeners.clear();
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    for (const handler of listenerMap.values()) {
      window.removeEventListener(LIVE_QUOTE_EVENT, handler as EventListener);
    }
  }
  listenerMap.clear();
}

export { LIVE_QUOTE_EVENT };
