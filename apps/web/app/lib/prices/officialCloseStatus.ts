import { getLatestOfficialCloseMaps } from "@/app/lib/prices/officialCloseCache";
import {
  CLOSE_PRICES_VERSION_EVENT,
} from "@/app/lib/prices/closePricesVersion";
import { subscribeOfficialCloseOverlay } from "@/app/lib/officialCloseOverlayStore";

export type OfficialCloseChangeListener = () => void;

const OFFICIAL_EVENTS: Array<string> = [
  "pricesImported",
  "pricesReady",
  "pricesReadyAfterCommit",
  CLOSE_PRICES_VERSION_EVENT,
];

const listenerMap = new Map<OfficialCloseChangeListener, {
  handler: () => void;
  overlayUnsubscribe?: () => void;
}>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function readPrice(map: Record<string, Record<string, number>> | undefined, symbol: string, day: string): number | undefined {
  if (!map) return undefined;
  const bucket = map[symbol];
  if (!bucket) return undefined;
  return bucket[day];
}

export function hasOfficialCloseFor(day: string, symbol: string): boolean {
  if (typeof day !== "string" || typeof symbol !== "string") {
    return false;
  }
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false;
  }
  const maps = getLatestOfficialCloseMaps();
  if (!maps) return false;
  const sources = [maps.official, maps.overlay, maps.idb, maps.packaged];
  for (const source of sources) {
    const price = readPrice(source, normalizedSymbol, day);
    if (Number.isFinite(price)) {
      return true;
    }
  }
  return false;
}

export function subscribeOfficialCloseChanged(listener: OfficialCloseChangeListener): void {
  if (listenerMap.has(listener)) {
    return;
  }
  const handler = () => {
    try {
      listener();
    } catch (error) {
      console.error("[officialCloseStatus] listener failed", error);
    }
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    for (const eventName of OFFICIAL_EVENTS) {
      window.addEventListener(eventName, handler as EventListener);
    }
  }
  const overlayUnsubscribe = subscribeOfficialCloseOverlay(handler);
  listenerMap.set(listener, { handler, overlayUnsubscribe });
}

export function unsubscribeOfficialCloseChanged(listener: OfficialCloseChangeListener): void {
  const stored = listenerMap.get(listener);
  if (!stored) return;
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    for (const eventName of OFFICIAL_EVENTS) {
      window.removeEventListener(eventName, stored.handler as EventListener);
    }
  }
  try {
    stored.overlayUnsubscribe?.();
  } catch (error) {
    console.error("[officialCloseStatus] overlay cleanup failed", error);
  }
  listenerMap.delete(listener);
}

export function __resetOfficialCloseStatusForTests(): void {
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    for (const { handler } of listenerMap.values()) {
      for (const eventName of OFFICIAL_EVENTS) {
        window.removeEventListener(eventName, handler as EventListener);
      }
    }
  }
  for (const { overlayUnsubscribe } of listenerMap.values()) {
    try {
      overlayUnsubscribe?.();
    } catch (error) {
      console.error("[officialCloseStatus] overlay cleanup failed", error);
    }
  }
  listenerMap.clear();
}
