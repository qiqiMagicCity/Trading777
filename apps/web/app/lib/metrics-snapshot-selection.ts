import { nyDateStrSafe } from "./time";
import { logger } from "@/lib/logger";

export interface NySnapshotSelection<T> {
  nyDay: string;
  originalMillis: number;
  snapshot: T;
  duplicates?: number;
}

interface SelectionCandidate<T> extends NySnapshotSelection<T> {
  updatedMillis: number;
  infoScore: number;
  serialized: string;
  seen: number;
}

function toMillis(input: unknown): number {
  if (input === undefined || input === null) return Number.NaN;
  const value = new Date(input as any).getTime();
  return Number.isFinite(value) ? value : Number.NaN;
}

function infoScore(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value !== "object") {
    return 1;
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + infoScore(item), 0);
  }

  const record = value as Record<string, unknown>;
  let total = 0;
  for (const val of Object.values(record)) {
    const child = infoScore(val);
    if (child > 0) {
      total += 1 + child;
    }
  }
  return total;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "number" || type === "boolean") return JSON.stringify(value);
  if (type === "string") return JSON.stringify(value);
  if (type === "undefined") return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (type === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, stableSerialize(v)] as const)
      .sort(([ka], [kb]) => (ka < kb ? -1 : ka > kb ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${v}`).join(",")}}`;
  }
  return String(value);
}

function compareCandidates<T>(current: SelectionCandidate<T> | undefined, candidate: SelectionCandidate<T>) {
  if (!current) return { replace: true, reason: "initial" as const };
  if (candidate.originalMillis > current.originalMillis) {
    return { replace: true, reason: "originalMillis" as const };
  }
  if (candidate.originalMillis < current.originalMillis) {
    return { replace: false, reason: "older" as const };
  }

  const { updatedMillis: candUpdated } = candidate;
  const { updatedMillis: currUpdated } = current;
  if (Number.isFinite(candUpdated) || Number.isFinite(currUpdated)) {
    if ((candUpdated || -Infinity) > (currUpdated || -Infinity)) {
      return { replace: true, reason: "updatedAt" as const };
    }
    if ((candUpdated || -Infinity) < (currUpdated || -Infinity)) {
      return { replace: false, reason: "updatedAt" as const };
    }
  }

  if (candidate.infoScore !== current.infoScore) {
    if (candidate.infoScore > current.infoScore) {
      return { replace: true, reason: "info" as const };
    }
    return { replace: false, reason: "info" as const };
  }

  if (candidate.serialized !== current.serialized) {
    if (candidate.serialized > current.serialized) {
      return { replace: true, reason: "lexicographical" as const };
    }
    return { replace: false, reason: "lexicographical" as const };
  }

  return { replace: false, reason: "identical" as const };
}

/**
 * 纽约日快照去重与排序规则：
 * 1. 以 nyDayStr 作为分组键，禁止直接使用任意 UTC 字符串。
 * 2. 组内按原始毫秒（输入记录真实时间）升序，仅保留最后一条。
 * 3. 当原始毫秒完全一致时依次比较：
 *    a) updatedAt/lastModified（若存在，取更晚者）；
 *    b) 信息量（字段非 null/undefined 越多者优先）；
 *    c) 稳定序列化后的字母序（较大者优先）。
 * 4. 不再允许通过“正午归一后比较”来推断新旧顺序，避免跨 DST 或 UTC 半夜时选错快照。
 */
export function selectLatestSnapshotsByNyDay<T extends { date?: unknown }>(
  snapshots: readonly T[] = [],
  options: { maxNyDay?: string } = {},
): NySnapshotSelection<T>[] {
  const maxNyDay = options.maxNyDay;
  const map = new Map<string, SelectionCandidate<T>>();

  snapshots.forEach((snapshot) => {
    const rawDate = (snapshot as { date?: unknown }).date;
    if (!rawDate) return;

    const acceptableRawDate =
      typeof rawDate === "string" ||
      typeof rawDate === "number" ||
      rawDate instanceof Date
        ? rawDate
        : undefined;

    if (!acceptableRawDate) return;

    const nyDay = nyDateStrSafe(acceptableRawDate);
    if (!nyDay || nyDay === "Invalid Date") return;
    if (maxNyDay && nyDay > maxNyDay) return;

    const originalMillis = toMillis(acceptableRawDate);
    if (!Number.isFinite(originalMillis)) return;

    const updatedMillisCandidates = [
      toMillis((snapshot as any)?.updatedAt),
      toMillis((snapshot as any)?.lastModified),
    ].filter((v) => Number.isFinite(v)) as number[];

    const updatedMillis =
      updatedMillisCandidates.length > 0
        ? Math.max(...updatedMillisCandidates)
        : Number.NaN;

    const candidate: SelectionCandidate<T> = {
      nyDay,
      originalMillis,
      snapshot,
      updatedMillis,
      infoScore: infoScore(snapshot),
      serialized: stableSerialize(snapshot),
      seen: 1,
    };

    const current = map.get(nyDay);
    if (!current) {
      map.set(nyDay, candidate);
      return;
    }

    const nextSeen = current.seen + 1;
    candidate.seen = nextSeen;
    const decision = compareCandidates(current, candidate);
    if (decision.replace) {
      if (
        candidate.originalMillis === current.originalMillis &&
        decision.reason !== "originalMillis" &&
        decision.reason !== "initial"
      ) {
        logger.debug("metrics:ny-day-snapshot-tie-break", {
          nyDay,
          reason: decision.reason,
          previous: current.serialized,
          next: candidate.serialized,
        });
      }
      map.set(nyDay, candidate);
    } else {
      current.seen = nextSeen;
    }
  });

  return Array.from(map.values())
    .sort((a, b) => {
      if (a.nyDay < b.nyDay) return -1;
      if (a.nyDay > b.nyDay) return 1;
      if (a.originalMillis < b.originalMillis) return -1;
      if (a.originalMillis > b.originalMillis) return 1;
      return 0;
    })
    .map(({ nyDay, originalMillis, snapshot, seen }) => ({
      nyDay,
      originalMillis,
      snapshot,
      duplicates: seen > 1 ? seen - 1 : undefined,
    }));
}

