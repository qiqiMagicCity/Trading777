import { migrateClosePriceMap } from "@/lib/closePriceMigration";

function applyClosePriceMigration(raw: unknown) {
  const { map } = migrateClosePriceMap(raw);
  return map;
}

export async function loadJson(name: 'trades'|'initial_positions'|'close_prices') {
  const url = `/${name}.json`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        return name === 'close_prices' ? applyClosePriceMigration(data) : data;
      }
    }
  } catch {
    // ignore fetch errors
  }
  switch (name) {
    case 'trades':
      return (await import('../../public/trades.json')).default;
    case 'initial_positions':
      return (await import('../../public/initial_positions.json')).default;
    case 'close_prices':
      return applyClosePriceMigration(
        (await import('../../public/close_prices.json')).default,
      );
  }
}
