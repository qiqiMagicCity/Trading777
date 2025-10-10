export type AlertSample = {
  stage: 'SSR' | 'HYDRATE' | 'AFTER_EVENTS';
  kind: string;
  reason?: string;
  inputs?: unknown;
  outputs?: unknown;
  missing?: Array<{ date: string; symbol: string }>;
  snapshotAt: number;
};

declare global {
  interface Window {
    __t7Alerts?: {
      push(sample: AlertSample): void;
      dump(): AlertSample[];
    };
  }
}

export const getBus = () => {
  if (typeof window === 'undefined') return null;
  if (!window.__t7Alerts) {
    const buffer: AlertSample[] = [];
    window.__t7Alerts = {
      push: (sample) => {
        try {
          buffer.push({ ...sample, snapshotAt: Date.now() });
        } catch (error) {
          console.warn('alertsBus.push failed', error);
        }
      },
      dump: () => buffer.slice(),
    };
  }
  return window.__t7Alerts!;
};

export const pushSample = (sample: AlertSample) => {
  const bus = getBus();
  if (bus) {
    bus.push(sample);
  }
};
