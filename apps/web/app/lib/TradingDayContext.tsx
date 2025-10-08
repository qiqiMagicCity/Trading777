"use client";

import React, { createContext, useContext, useMemo, useRef } from "react";
import { resolveTradingDayStr } from "./nyDay";

const TradingDayContext = createContext<string | null>(null);

export function TradingDayProvider({
  initialTradingDay,
  children,
}: {
  initialTradingDay?: string;
  children: React.ReactNode;
}) {
  const frozen = useRef<string>(
    typeof initialTradingDay === "string" && initialTradingDay.length > 0
      ? initialTradingDay
      : resolveTradingDayStr(),
  );
  const value = useMemo(() => frozen.current, []);
  return <TradingDayContext.Provider value={value}>{children}</TradingDayContext.Provider>;
}

export function useTradingDay(): string {
  const value = useContext(TradingDayContext);
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return resolveTradingDayStr();
}
