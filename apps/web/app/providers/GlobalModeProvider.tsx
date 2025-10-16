"use client";

import React from "react";
import { useGlobalMeta } from "@/state/globalModeStore";

export default function GlobalModeProvider({ children }: { children: React.ReactNode }) {
  // 仅为触发全局模式引擎初始化与订阅；不渲染任何 UI
  useGlobalMeta();
  return <>{children}</>;
}
