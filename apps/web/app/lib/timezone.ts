import { toNY, nowNY } from '@/lib/timezone';
/**
 * timezone.ts – Helpers to ensure site consistently uses New York (America/New_York) time,
 * regardless of server or browser locale.
 */
export const toNY = (dateInput: string | number | Date = Date.now()): Date => {
  const base = typeof dateInput === 'object' ? dateInput as Date : toNY(dateInput);
  const nyString = base.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return toNY(nyString);
};

export const nowNY = (): Date => toNY(Date.now());

export const formatNY = (
  dateInput: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }
): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options }).format(
    typeof dateInput === 'object' ? (dateInput as Date) : toNY(dateInput),
  );

// Attach helper to global for quick usage in dev tools
// @ts-ignore
(globalThis as any).toNY = toNY;
