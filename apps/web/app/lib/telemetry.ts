export type TelemetryEvent = {
  type: string;
  payload?: Record<string, unknown>;
  ts?: string;
};

type Sink = (event: TelemetryEvent) => void;

let sink: Sink | null = null;

/**
 * 注入埋点接收器；默认静默。若 window.DEBUG_TELEMETRY 为真则输出到 console.info。
 */
export function setTelemetrySink(fn: Sink | null) {
  sink = fn;
}

export function emit(type: string, payload?: Record<string, unknown>) {
  const event: TelemetryEvent = {
    type,
    payload,
    ts: new Date().toISOString(),
  };

  try {
    if (sink) {
      sink(event);
      return;
    }

    if (typeof window !== "undefined" && (window as unknown as { DEBUG_TELEMETRY?: boolean }).DEBUG_TELEMETRY) {
      console.info("[telemetry]", event);
    }
  } catch {
    // no-op
  }
}
