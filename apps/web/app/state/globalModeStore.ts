"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nowNY } from "@/lib/timezone";
import {
  beforeOfficialClose,
  isTradingDay,
  pickEvaluationDay,
} from "@/app/lib/time/evaluationDay";
import { getRelatedSymbols } from "@/app/lib/symbols/relatedSymbols";
import { computeGlobalMeta, type GlobalMeta } from "@/app/lib/mode/globalMeta";
import {
  hasLivePriceFor,
  subscribeLivePriceTick,
  unsubscribeLivePriceTick,
} from "@/app/state/livePriceStatus";
import {
  hasOfficialCloseFor,
  subscribeOfficialCloseChanged,
  unsubscribeOfficialCloseChanged,
} from "@/app/lib/prices/officialCloseStatus";

const ENABLED = process.env.NEXT_PUBLIC_MODE_ENGINE_V2 === "1";

interface GlobalMetaState {
  value: GlobalMeta | null;
}

const state: GlobalMetaState = {
  value: null,
};

const subscribers = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(subscribers)) {
    try {
      listener();
    } catch (error) {
      console.error("[globalModeStore] listener failed", error);
    }
  }
}

function setState(next: GlobalMeta | null): void {
  const prev = state.value;
  if (prev === next) {
    return;
  }
  if (
    prev &&
    next &&
    prev.mode === next.mode &&
    prev.evaluationDay === next.evaluationDay &&
    prev.latestPriceOk === next.latestPriceOk &&
    prev.officialCloseOk === next.officialCloseOk &&
    prev.degradedReason === next.degradedReason &&
    prev.isComplete === next.isComplete &&
    prev.missingPairs.length === next.missingPairs.length &&
    prev.missingPairs.every((item, index) => {
      const counterpart = next.missingPairs[index];
      return counterpart && counterpart.day === item.day && counterpart.symbol === item.symbol;
    })
  ) {
    return;
  }
  state.value = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function getSnapshot(): GlobalMeta | null {
  return ENABLED ? state.value : null;
}

function getServerSnapshot(): GlobalMeta | null {
  return null;
}

let initialized = false;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let lastEvaluationDay: string | null = null;
let lastBeforeClose: boolean | null = null;
let lastTradingDay: boolean | null = null;
let recomputeQueued = false;
let recomputeRunning = false;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
const boundaryHits = new Set<number>();

const liveTickHandler = () => requestRecompute();
const officialChangeHandler = () => requestRecompute();
const focusHandler = () => requestRecompute();
let focusAttached = false;

const BOUNDARY_MINUTES = new Set<number>([9 * 60 + 30, 13 * 60, 16 * 60]);

function requestRecompute(): void {
  if (!ENABLED) return;
  if (throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    void triggerRecompute();
  }, 500);
}

async function triggerRecompute(): Promise<void> {
  if (!ENABLED) return;
  if (recomputeRunning) {
    recomputeQueued = true;
    return;
  }
  recomputeRunning = true;
  try {
    await recompute();
  } finally {
    recomputeRunning = false;
    if (recomputeQueued) {
      recomputeQueued = false;
      requestRecompute();
    }
  }
}

async function recompute(): Promise<void> {
  try {
    const now = nowNY();
    const evaluationDay = pickEvaluationDay(now);
    const tradingDay = isTradingDay(now);
    const beforeCloseFlag = beforeOfficialClose(now);
    const relatedSymbols = await getRelatedSymbols(evaluationDay);
    const meta = await computeGlobalMeta({
      nowNY: now,
      evaluationDay,
      isTradingDay: tradingDay,
      beforeOfficialClose: beforeCloseFlag,
      relatedSymbols,
      hasLivePriceFor,
      hasOfficialCloseFor,
    });
    setState(meta);
    lastEvaluationDay = evaluationDay;
    lastBeforeClose = beforeCloseFlag;
    lastTradingDay = tradingDay;
  } catch (error) {
    console.error("[globalModeStore] recompute failed", error);
  }
}

function startClockWatcher(): void {
  if (clockTimer || typeof window === "undefined") {
    return;
  }
  const tick = () => {
    if (!ENABLED) return;
    const now = nowNY();
    const evaluationDay = pickEvaluationDay(now);
    const tradingDay = isTradingDay(now);
    const beforeCloseFlag = beforeOfficialClose(now);
    if (lastEvaluationDay !== evaluationDay) {
      boundaryHits.clear();
      lastEvaluationDay = evaluationDay;
      requestRecompute();
      return;
    }
    if (lastTradingDay !== tradingDay) {
      lastTradingDay = tradingDay;
      requestRecompute();
    }
    if (lastBeforeClose !== beforeCloseFlag) {
      lastBeforeClose = beforeCloseFlag;
      requestRecompute();
    }
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    if (!boundaryHits.has(minuteOfDay) && BOUNDARY_MINUTES.has(minuteOfDay)) {
      boundaryHits.add(minuteOfDay);
      requestRecompute();
    }
  };
  tick();
  clockTimer = setInterval(tick, 30_000);
}

function initialize(): void {
  if (initialized || !ENABLED) {
    return;
  }
  initialized = true;
  subscribeLivePriceTick(liveTickHandler);
  subscribeOfficialCloseChanged(officialChangeHandler);
  if (typeof window !== "undefined") {
    if (!focusAttached) {
      window.addEventListener("focus", focusHandler);
      focusAttached = true;
    }
  }
  startClockWatcher();
  void triggerRecompute();
}

export function useGlobalMeta(): GlobalMeta | null {
  useEffect(() => {
    initialize();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function forceRecomputeGlobalMeta(): void {
  if (!ENABLED) return;
  void triggerRecompute();
}

export function __resetGlobalMetaStoreForTests(): void {
  state.value = null;
  subscribers.clear();
  lastEvaluationDay = null;
  lastBeforeClose = null;
  lastTradingDay = null;
  boundaryHits.clear();
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  unsubscribeLivePriceTick(liveTickHandler);
  unsubscribeOfficialCloseChanged(officialChangeHandler);
  if (focusAttached && typeof window !== "undefined") {
    window.removeEventListener("focus", focusHandler);
    focusAttached = false;
  }
  initialized = false;
  recomputeQueued = false;
  recomputeRunning = false;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
}
