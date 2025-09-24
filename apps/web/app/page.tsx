"use client";

import { useEffect } from "react";
import { ensureBuiltInDatasetLoaded } from "@/app/lib/ensureBuiltInDatasetLoaded";

/**
 * Root dashboard page.
 * NOTE: App Router pages must only export a default component.
 */
export default function Page() {
  useEffect(() => {
    ensureBuiltInDatasetLoaded().catch((err) => {
      console.error("Dataset bootstrap failed:", err);
    });
  }, []);

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      {/* Put your dashboard content here */}
    </main>
  );
}
