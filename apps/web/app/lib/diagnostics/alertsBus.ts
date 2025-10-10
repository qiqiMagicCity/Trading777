export type AlertSample = {
  stage: 'SSR'|'HYDRATE'|'AFTER_EVENTS';
  kind: string;
  reason?: string;
  inputs?: unknown;
  outputs?: unknown;
  missing?: Array<{ date: string; symbol: string }>;
  snapshotAt?: number;
};
declare global {
  interface Window {
    __t7Alerts?: {
      push(sample: AlertSample): void;
      dump(): AlertSample[];
    };
  }
}

export const getBus = (): Window["__t7Alerts"] | null => {
  if (typeof window === "undefined") return null;
  if (!window.__t7Alerts) {
    const buffer: AlertSample[] = [];
    window.__t7Alerts = {
      push: (sample) => {
        try {
          buffer.push({ ...sample, snapshotAt: Date.now() });
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("alertsBus push failed", error);
          }
        }
      },
      dump: () => buffer.slice(),
    };
  }
  return window.__t7Alerts ?? null;
};

export const pushSample = (sample: AlertSample): void => {
  const bus = getBus();
  if (bus) {
    bus.push(sample);
  }
};
