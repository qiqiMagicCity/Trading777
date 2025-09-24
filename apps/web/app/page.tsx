"use client";

import { useEffect } from "react";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";

/**
 * Root dashboard page.
 * NOTE: Next.js App Router pages must only export a default component.
 * Do NOT export named functions/vars from this file.
 */
export default function Page() {
  useEffect(() => {
    ensureBuiltInDatasetLoaded().catch((err) => {
      console.error("Dataset bootstrap failed:", err);
    });
  }, []);

  // 将你原来的页面内容放到这里即可
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      {/* your dashboard content */}
    </main>
  );
}
