import { create } from 'zustand';
import { Metrics } from './metrics';

interface StoreState {
  // 指标数据
  metrics: Metrics | null;
  // 设置指标方法
  setMetrics: (metrics: Metrics) => void;
  // shadow diff
  shadowDiff: Record<string, number> | null;
  // setter for shadow diff
  setShadowDiff: (diff: Record<string, number>) => void;
}

export const useStore = create<StoreState>((set) => ({
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),
  shadowDiff: null,
  setShadowDiff: (diff) => set({ shadowDiff: diff }),
}));
