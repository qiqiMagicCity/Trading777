"use client";

import { useEffect } from "react";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";

/**
 * Root dashboard page.
 * NOTE: Next.js App Router pages must only export a default component.
 * Do NOT export named functions from this file.
 */
export default function Page() {
  useEffect(() => {
    ensureBuiltInDatasetLoaded().catch((err) => {
      console.error("Dataset bootstrap failed:", err);
    });
  }, []);

  // TODO: 若你有原先的 Dashboard 组件，请把其 JSX 放到下面这个 <main> 中
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      {/* 放你原先的页面内容 */}
    </main>
  );
}
