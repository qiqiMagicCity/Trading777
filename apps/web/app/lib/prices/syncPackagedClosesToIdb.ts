import { loadJson } from "@/app/lib/dataSource";
import { getPrice, putPrice } from "@/lib/services/dataService";

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function syncPackagedClosesToIdb(): Promise<void> {
  try {
    const data = await loadJson("close_prices");
    if (!data || typeof data !== "object") return;

    const tasks: Promise<void>[] = [];
    for (const [rawSymbol, rawDates] of Object.entries(
      data as Record<string, Record<string, number>>,
    )) {
      if (!rawSymbol || typeof rawSymbol !== "string") continue;
      const symbol = rawSymbol.trim().toUpperCase();
      if (!symbol) continue;
      if (!rawDates || typeof rawDates !== "object") continue;

      for (const [rawDate, rawClose] of Object.entries(rawDates)) {
        if (!isValidDate(rawDate) || !isFiniteNumber(rawClose)) continue;
        tasks.push(
          (async () => {
            const existing = await getPrice(symbol, rawDate);
            if (existing?.source && existing.source.startsWith("official/import")) {
              return;
            }
            await putPrice({
              symbol,
              date: rawDate,
              close: rawClose,
              source: "official/packaged",
            });
          })(),
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  } catch (err) {
    console.warn("[syncPackagedClosesToIdb] failed", err);
  }
}
