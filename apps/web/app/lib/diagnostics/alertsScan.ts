import { normalizeCloseMap } from "@/app/lib/prices/normalizeCloseMap";
import { requireOfficialClose } from "@/app/lib/prices/officialCloseFacade";
import { getLatestOfficialCloseMaps } from "@/app/lib/prices/officialCloseCache";
import { createMissingOfficialCloseDiagnostics } from "@/app/lib/diagnostics/reportMissingOfficialClose";
import { setOfficialCloseContext } from "@/app/lib/price/requireOfficialClose";

export type ScanUniverse = { dates: string[]; symbols: string[] }; // dates 内包含 E 或 E-1

// A) 统一官方口径（overlay + official/import + packaged + idb）
export async function scanUnified(universe: ScanUniverse) {
  const maps = getLatestOfficialCloseMaps();
  const diagnostics = createMissingOfficialCloseDiagnostics();
  const release = setOfficialCloseContext({
    map: maps?.official ?? {},
    overlayMap: maps?.overlay ?? {},
    packagedMap: maps?.packaged ?? {},
    idbMap: maps?.idb ?? {},
    diagnostics,
  });
  try {
    const missing: Array<{ date: string; symbol: string }> = [];
    for (const date of universe.dates) {
      for (const symbol of universe.symbols) {
        const verdict = requireOfficialClose(symbol, date, "selfcheck");
        if (!verdict.ok) {
          missing.push({ date, symbol });
        }
      }
    }
    return { missing };
  } finally {
    release();
  }
}

// B) packaged-only 口径（只看 /close_prices.json）
export async function scanPackagedOnly(universe: ScanUniverse) {
  const res = await fetch(`/close_prices.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    return { error: `packaged fetch ${res.status}`, missing: [] as Array<{ date: string; symbol: string }> };
  }
  const raw: unknown = await res.json();
  const byDate = normalizeCloseMap(
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined,
  );
  const out: Array<{ date: string; symbol: string }> = [];
  for (const date of universe.dates) {
    const perSymbol = byDate[date] || {};
    for (const symbol of universe.symbols) {
      const value = perSymbol[symbol];
      if (value == null) {
        out.push({ date, symbol });
      }
    }
  }
  return { missing: out };
}
