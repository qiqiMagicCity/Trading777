import type { MissingOfficialClosePurpose } from "@/app/lib/diagnostics/reportMissingOfficialClose";

export type CorporateActionType = "split" | "reverse_split";

export interface CorporateActionEvent {
  symbol: string;
  date: string;
  type: CorporateActionType;
  /**
   * Price multiplier to convert from the date before the action to the date of/after the action.
   * Example: 2-for-1 split => factor 0.5; 1-for-5 reverse split => factor 5.
   */
  factor: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSymbol(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toUpperCase();
  return trimmed;
}

function normalizeDate(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return DATE_RE.test(trimmed) ? trimmed : "";
}

function normalizeFactor(value: number | string | undefined | null): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  return num;
}

const corporateActions = new Map<string, CorporateActionEvent[]>();

function sortEvents(events: CorporateActionEvent[]): CorporateActionEvent[] {
  return events
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
}

export function setCorporateActions(events: CorporateActionEvent[]): void {
  corporateActions.clear();
  addCorporateActions(events);
}

export function addCorporateActions(events: CorporateActionEvent[]): void {
  for (const raw of events) {
    const symbol = normalizeSymbol(raw?.symbol);
    const date = normalizeDate(raw?.date);
    const factor = normalizeFactor(raw?.factor);
    if (!symbol || !date || !Number.isFinite(factor)) continue;
    const type = raw?.type === "reverse_split" ? "reverse_split" : "split";
    const entry: CorporateActionEvent = { symbol, date, type, factor };
    const existing = corporateActions.get(symbol) ?? [];
    const filtered = existing.filter((event) => event.date !== date);
    filtered.push(entry);
    corporateActions.set(symbol, sortEvents(filtered));
  }
}

export function clearCorporateActions(): void {
  corporateActions.clear();
}

export function getCorporateActions(symbol: string): CorporateActionEvent[] {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];
  return corporateActions.get(normalized) ?? [];
}

export function getAdjustmentFactor(
  symbol: string,
  fromDate: string,
  toDate: string,
): number {
  const symbolKey = normalizeSymbol(symbol);
  const from = normalizeDate(fromDate);
  const to = normalizeDate(toDate);
  if (!symbolKey || !from || !to) return 1;
  if (from === to) return 1;
  const events = corporateActions.get(symbolKey);
  if (!events || events.length === 0) return 1;
  if (from < to) {
    return events
      .filter((event) => event.date > from && event.date <= to)
      .reduce((acc, event) => acc * event.factor, 1);
  }
  if (from > to) {
    return events
      .filter((event) => event.date > to && event.date <= from)
      .reduce((acc, event) => acc / event.factor, 1);
  }
  return 1;
}

export function describeAdjustment(
  symbol: string,
  fromDate: string,
  toDate: string,
): { factor: number; events: CorporateActionEvent[] } {
  const factor = getAdjustmentFactor(symbol, fromDate, toDate);
  const symbolKey = normalizeSymbol(symbol);
  const from = normalizeDate(fromDate);
  const to = normalizeDate(toDate);
  if (!symbolKey || !from || !to) {
    return { factor: 1, events: [] };
  }
  const events = getCorporateActions(symbolKey).filter((event) => {
    if (from < to) {
      return event.date > from && event.date <= to;
    }
    if (from > to) {
      return event.date > to && event.date <= from;
    }
    return false;
  });
  return { factor, events };
}

export type AdjustmentPurpose = MissingOfficialClosePurpose;
