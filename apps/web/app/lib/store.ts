import { create } from 'zustand';
import type { Metrics } from './metrics';
import type { PeriodHealth } from './types/health';

interface StoreState {
  metrics: Metrics | null;
  setMetrics: (metrics: Metrics | null) => void;
  periodHealth: PeriodHealth | null;
  setPeriodHealth: (health: PeriodHealth | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),
  periodHealth: null,
  setPeriodHealth: (periodHealth) => set({ periodHealth }),
}));
