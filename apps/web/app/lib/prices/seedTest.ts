import { migrateClosePriceMap } from "@/app/lib/closePriceMigration";
import type { CachedPrice } from "@/app/lib/services/dataService";
import { putPrice } from "@/app/lib/services/dataService";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function seedClosePricesForTest(
  input: Record<string, Record<string, number>>,
  options?: { source?: CachedPrice["source"] },
): Promise<void> {
  const { map } = migrateClosePriceMap(input);
  const source: CachedPrice["source"] = options?.source ?? "import";
  const tasks: Promise<void>[] = [];

  for (const [symbol, byDate] of Object.entries(map)) {
    if (!byDate || typeof byDate !== "object") continue;
    for (const [date, value] of Object.entries(byDate)) {
      if (!ISO_DATE_RE.test(date)) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      tasks.push(
        putPrice({
          symbol,
          date,
          close: value,
          source,
        }),
      );
    }
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
