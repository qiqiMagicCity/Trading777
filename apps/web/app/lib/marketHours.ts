import { nowNY, ymdInNY } from "@/lib/timezone";
import {
  marketBoundaries,
  isTradingDay as nyIsTradingDay,
  previousTradingDay as nyPreviousTradingDay,
  MARKET_OPEN_MINUTES,
  MARKET_CLOSE_MINUTES,
} from "@/app/lib/nyDay";

const DEFAULT_CLOSE_GRACE_MIN = 0;

export {
  nyIsTradingDay as isTradingDay,
  marketBoundaries,
  nyPreviousTradingDay as previousTradingDay,
  MARKET_OPEN_MINUTES,
  MARKET_CLOSE_MINUTES,
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

export const marketOpenTimeNY = (ymd: string): Date => marketBoundaries(ymd).open;

export const marketCloseTimeNY = (ymd: string): Date => marketBoundaries(ymd).close;

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
  const boundaries = marketBoundaries(ymd);
  const normalized = boundaries.ymd || (ymd.includes('T') ? ymdInNY(ymd) : ymd);
  const trading = normalized ? nyIsTradingDay(normalized) : false;
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

  const close = boundaries.close;
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
