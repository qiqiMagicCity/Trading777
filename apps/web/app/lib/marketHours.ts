import { nowNY, toNY, ymdInNY } from "@/lib/timezone";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const MARKET_OPEN_MINUTES = 9 * 60 + 30;
export const MARKET_CLOSE_MINUTES = 16 * 60;
const DEFAULT_CLOSE_GRACE_MIN = 0;

const ADHOC_CLOSED_DATES = new Set<string>();

const isoDateFromYmd = (ymd: string): Date => {
  if (!DATE_ONLY_RE.test(ymd)) return new Date(NaN);
  return toNY(`${ymd}T12:00:00Z`);
};

export const resolveCloseGraceMinutes = (): number => {
  const raw = process.env.CLOSE_GRACE_MIN;
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_CLOSE_GRACE_MIN;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CLOSE_GRACE_MIN;
  if (parsed < 0) return DEFAULT_CLOSE_GRACE_MIN;
  return parsed;
};

export const isTradingDay = (ymd: string): boolean => {
  const base = isoDateFromYmd(ymd);
  if (Number.isNaN(base.getTime())) return false;
  if (ADHOC_CLOSED_DATES.has(ymd)) return false;
  const weekday = base.getDay();
  return weekday !== 0 && weekday !== 6;
};

const offsetMinutes = (ymd: string, minutes: number): Date => {
  const base = isoDateFromYmd(ymd);
  if (Number.isNaN(base.getTime())) return base;
  const d = new Date(base.getTime());
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes, 0, 0);
  return d;
};

export const marketOpenTimeNY = (ymd: string): Date =>
  offsetMinutes(ymd, MARKET_OPEN_MINUTES);

export const marketCloseTimeNY = (ymd: string): Date =>
  offsetMinutes(ymd, MARKET_CLOSE_MINUTES);

const previousTradingDayInternal = (ymd: string): string => {
  let probe = isoDateFromYmd(ymd);
  if (Number.isNaN(probe.getTime())) return "";
  do {
    probe.setDate(probe.getDate() - 1);
  } while (!Number.isNaN(probe.getTime()) && !isTradingDay(ymdInNY(probe)));
  return ymdInNY(probe);
};

export const previousTradingDay = (ymd: string): string => {
  const normalized = DATE_ONLY_RE.test(ymd) ? ymd : ymdInNY(ymd);
  return previousTradingDayInternal(normalized);
};

export interface CloseRequirementState {
  date: string;
  isTradingDay: boolean;
  requireOfficialClose: boolean;
  graceMinutes: number;
  windowEndTs: number | null;
  nowTs: number;
}

export const evaluateCloseRequirement = (
  ymd: string,
  now: Date = nowNY(),
): CloseRequirementState => {
  const normalized = DATE_ONLY_RE.test(ymd) ? ymd : ymdInNY(ymd);
  const trading = isTradingDay(normalized);
  const grace = resolveCloseGraceMinutes();
  const nowTs = now.getTime();
  if (!trading) {
    return {
      date: normalized,
      isTradingDay: false,
      requireOfficialClose: false,
      graceMinutes: grace,
      windowEndTs: null,
      nowTs,
    };
  }

  const close = marketCloseTimeNY(normalized);
  const windowEnd = Number.isNaN(close.getTime())
    ? null
    : close.getTime() + grace * 60_000;
  const todayStr = ymdInNY(now);

  let requireOfficialClose = false;
  if (normalized < todayStr) {
    requireOfficialClose = true;
  } else if (normalized === todayStr) {
    if (windowEnd === null) {
      requireOfficialClose = true;
    } else {
      requireOfficialClose = nowTs >= windowEnd;
    }
  } else {
    requireOfficialClose = false;
  }

  return {
    date: normalized,
    isTradingDay: true,
    requireOfficialClose,
    graceMinutes: grace,
    windowEndTs: windowEnd,
    nowTs,
  };
};

export interface CloseWindowState extends CloseRequirementState {
  inWindow: boolean;
}

export const evaluateCloseWindow = (
  ymd: string,
  now: Date = nowNY(),
): CloseWindowState => {
  const requirement = evaluateCloseRequirement(ymd, now);
  const todayStr = ymdInNY(now);
  const inWindow =
    requirement.isTradingDay &&
    requirement.date === todayStr &&
    requirement.windowEndTs !== null &&
    requirement.nowTs < requirement.windowEndTs;
  return { ...requirement, inWindow };
};

export const shouldRequireOfficialClose = (
  ymd: string,
  now: Date = nowNY(),
): boolean => evaluateCloseRequirement(ymd, now).requireOfficialClose;
