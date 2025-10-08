import { EventEmitter } from "events";

type Phase = "IDLE" | "BUILDING" | "COMMITTING" | "READY";

interface GateState {
  phase: Phase;
  version: number;
  pendingVersion: number | null;
}

interface ReadyPayload {
  version: number;
}

type GateEvents = {
  ready: [ReadyPayload];
};

const emitter = new EventEmitter<GateEvents>();
emitter.setMaxListeners(50);

const state: GateState = {
  phase: "IDLE",
  version: 0,
  pendingVersion: null,
};

function snapshot(): GateState {
  return { ...state };
}

const TRACE_ON =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_DIAG_PRICE_READY_TRACE || process.env.DIAG_PRICE_READY_TRACE)) ||
  false;

// 放宽参数类型，避免 ReadyPayload 必须满足 Record<string, unknown> 的索引签名约束
function trace(...args: unknown[]) {
  if (!TRACE_ON) return;
  // eslint-disable-next-line no-console
  console.log("[PRICE_GATE]", ...args);
}

export function current(): GateState {
  return snapshot();
}

export function beginBuild(): void {
  state.phase = "BUILDING";
  state.pendingVersion = null;
  trace("beginBuild");
}

export function beginCommit(nextVersion: number): void {
  state.phase = "COMMITTING";
  state.pendingVersion = nextVersion;
  trace("beginCommit", { nextVersion });
}

export function markReady(committedVersion?: number): void {
  if (typeof committedVersion === "number") {
    state.pendingVersion = committedVersion;
  }
  if (state.pendingVersion !== null && state.pendingVersion < state.version) {
    trace("markReady:regression", { committedVersion: state.pendingVersion });
    state.pendingVersion = null;
  }
  if (state.pendingVersion !== null) {
    state.version = state.pendingVersion;
    state.pendingVersion = null;
  }
  state.phase = "READY";
  const payload: ReadyPayload = { version: state.version };
  trace("markReady", payload);
  emitter.emit("ready", payload);
}

export function waitUntilAtLeast(targetVersion: number): Promise<ReadyPayload> {
  if (state.phase === "READY" && state.version >= targetVersion) {
    return Promise.resolve({ version: state.version });
  }
  return new Promise((resolve) => {
    const handler = (payload: ReadyPayload) => {
      if (state.phase === "READY" && payload.version >= targetVersion) {
        emitter.off("ready", handler);
        resolve(payload);
      }
    };
    emitter.on("ready", handler);
  });
}

export async function withGateTrace<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  trace("enter", { label });
  try {
    const result = await fn();
    trace("exit", { label });
    return result;
  } catch (error) {
    trace("error", { label, error });
    throw error;
  }
}

export function resetGateForTests(): void {
  state.phase = "IDLE";
  state.version = 0;
  state.pendingVersion = null;
  emitter.removeAllListeners();
}
