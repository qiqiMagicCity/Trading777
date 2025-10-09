import { migrateClosePriceMap } from "@/app/lib/closePriceMigration";
import { importClosePricesIntoCache } from "@/app/lib/services/dataService";
import { getWritebackMode, type WritebackMode } from "@/app/lib/prices/writebackConfig";
import { isOfficialCloseFixEnabled } from "@/app/lib/prices/officialCloseFeatureFlag";

export type WritebackStatus = "skipped" | "success" | "failed" | "unsupported";

export interface ImportClosePricesResult {
  imported: number;
  writebackMode: WritebackMode;
  writebackStatus: WritebackStatus;
  error?: string;
}

export async function importClosePricesInternal(
  raw: Record<string, Record<string, number>> | unknown,
): Promise<ImportClosePricesResult> {
  const { map } = migrateClosePriceMap(raw);
  const imported = await importClosePricesIntoCache(map);
  const mode = getWritebackMode();

  if (mode === "none") {
    return { imported, writebackMode: mode, writebackStatus: "skipped" };
  }

  if (mode === "pr") {
    return { imported, writebackMode: mode, writebackStatus: "unsupported" };
  }

  if (mode === "proxy") {
    try {
      const response = await fetch("/api/close-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "bulk", data: map }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const reason = text || response.statusText || `HTTP ${response.status}`;
        return {
          imported,
          writebackMode: mode,
          writebackStatus: "failed",
          error: reason,
        };
      }
      return { imported, writebackMode: mode, writebackStatus: "success" };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "writeback request failed";
      return {
        imported,
        writebackMode: mode,
        writebackStatus: "failed",
        error: message,
      };
    }
  }

  return { imported, writebackMode: mode, writebackStatus: "skipped" };
}

export async function importClosePrices(
  raw: Record<string, Record<string, number>> | unknown,
): Promise<ImportClosePricesResult> {
  if (isOfficialCloseFixEnabled()) {
    const facade = await import("@/app/lib/prices/officialCloseFacade");
    return facade.importClosePrices(raw);
  }
  const result = await importClosePricesInternal(raw);
  try {
    const stamp = String(Date.now());
    if (typeof window !== "undefined" && window?.localStorage) {
      window.localStorage.setItem("close_prices_version", stamp);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem("close_prices_version", stamp);
    }
  } catch {
    // ignore storage errors in legacy path
  }
  return result;
}
