export type ClosePriceMap = Record<string, Record<string, number>>;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function normalizeDateKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (DATE_KEY_RE.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.includes('T')) {
    const candidate = trimmed.slice(0, 10);
    return DATE_KEY_RE.test(candidate) ? candidate : null;
  }
  return null;
}

function normalizePrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const value = Number(raw.trim());
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function normalizeClosePriceData(input: unknown): ClosePriceMap {
  const normalized: ClosePriceMap = {};
  if (!input || typeof input !== 'object') {
    return normalized;
  }

  for (const [outerKey, rawInner] of Object.entries(input as Record<string, unknown>)) {
    if (!rawInner || typeof rawInner !== 'object') {
      continue;
    }

    const maybeDate = normalizeDateKey(outerKey);
    if (maybeDate) {
      for (const [rawSymbol, rawPrice] of Object.entries(rawInner as Record<string, unknown>)) {
        const symbolKey = normalizeSymbol(rawSymbol);
        const price = normalizePrice(rawPrice);
        if (!symbolKey || price === null) continue;
        (normalized[symbolKey] ??= {})[maybeDate] = price;
      }
      continue;
    }

    const symbolKey = normalizeSymbol(outerKey);
    if (!symbolKey) {
      continue;
    }
    const target = (normalized[symbolKey] ??= {});
    for (const [rawDate, rawPrice] of Object.entries(rawInner as Record<string, unknown>)) {
      const dateKey = normalizeDateKey(rawDate);
      const price = normalizePrice(rawPrice);
      if (!dateKey || price === null) continue;
      target[dateKey] = price;
    }
  }

  return normalized;
}

export function sortClosePriceMap(input: ClosePriceMap): ClosePriceMap {
  const sorted: ClosePriceMap = {};
  for (const symbol of Object.keys(input).sort()) {
    const entries = input[symbol];
    sorted[symbol] = {};
    for (const date of Object.keys(entries).sort()) {
      sorted[symbol][date] = entries[date];
    }
  }
  return sorted;
}

