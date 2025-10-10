export type AlertSample = {
  stage: 'SSR' | 'HYDRATE' | 'AFTER_EVENTS';
  kind: string; // 组件/提醒类型标识
  reason?: string; // 判定理由（函数名/口径）
  sources?: string[]; // 命中的数据源链（overlay, official/import, official/packaged, idb...）
  missing?: Array<{ date: string; symbol: string }>;
  snapshotAt?: number;
};

declare global {
  interface Window {
    __t7Diag?: { push: (s: AlertSample) => void; dump: () => AlertSample[] };
  }
}

export const getDiagBus = () => {
  if (typeof window === 'undefined') return null;
  if (!window.__t7Diag) {
    const buf: AlertSample[] = [];
    window.__t7Diag = {
      push: (s) => {
        try {
          buf.push(s);
        } catch {
          // ignore push failure
        }
      },
      dump: () => buf.slice(),
    };
  }
  return window.__t7Diag!;
};

export const pushAlertSample = (s: AlertSample) => {
  const bus = getDiagBus();
  if (!bus) return;
  bus.push({ ...s, snapshotAt: Date.now() });
};
