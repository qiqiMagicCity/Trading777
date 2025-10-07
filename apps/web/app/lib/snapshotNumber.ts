export type SnapshotNumericField =
  | "realized"
  | "realized_today"
  | "unrealized"
  | "unrealizedDelta"
  | "resolvedUnrealized"
  | (string & {});

export type SnapshotParseErrorCode = "PARSE_NUM_FAILED";

export type SnapshotParseErrorReason =
  | "MISSING"
  | "EMPTY"
  | "INVALID_TYPE"
  | "INVALID_FORMAT"
  | "NON_FINITE";

export interface SnapshotParseError {
  code: SnapshotParseErrorCode;
  reason: SnapshotParseErrorReason;
  value: unknown;
  trimmed?: string;
}

export type ParseSnapshotNumberResult =
  | { ok: true; value: number }
  | { ok: false; error: SnapshotParseError };

const DECIMAL_PATTERN =
  /^[+-]?(?:\d+\.?\d*|\d*\.?\d+)(?:[eE][+-]?\d+)?$/;

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function parseSnapshotNumber(value: unknown): ParseSnapshotNumberResult {
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return { ok: true, value: normalizeZero(value) };
    }
    return {
      ok: false,
      error: { code: "PARSE_NUM_FAILED", reason: "NON_FINITE", value },
    };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: { code: "PARSE_NUM_FAILED", reason: "EMPTY", value, trimmed },
      };
    }

    if (!DECIMAL_PATTERN.test(trimmed)) {
      return {
        ok: false,
        error: {
          code: "PARSE_NUM_FAILED",
          reason: "INVALID_FORMAT",
          value,
          trimmed,
        },
      };
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: {
          code: "PARSE_NUM_FAILED",
          reason: "NON_FINITE",
          value,
          trimmed,
        },
      };
    }

    return { ok: true, value: normalizeZero(parsed) };
  }

  if (value === null || value === undefined) {
    return {
      ok: false,
      error: { code: "PARSE_NUM_FAILED", reason: "MISSING", value },
    };
  }

  return {
    ok: false,
    error: { code: "PARSE_NUM_FAILED", reason: "INVALID_TYPE", value },
  };
}

export interface SnapshotFieldParseError extends SnapshotParseError {
  field: SnapshotNumericField;
  day: string;
}
