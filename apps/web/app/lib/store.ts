import { create } from 'zustand';
import type { MetricsContract } from './types/metrics';
import type { PeriodHealth } from './types/health';

interface StoreState {
  metrics: MetricsContract | null;
  setMetrics: (metrics: MetricsContract | null) => void;
  periodHealth: PeriodHealth | null;
  setPeriodHealth: (health: PeriodHealth | null) => void;
}

export const useStore = create<StoreState>((set) => ({
  metrics: null,
  setMetrics: (metrics) => set({ metrics }),
  periodHealth: null,
  setPeriodHealth: (periodHealth) => set({ periodHealth }),
}));
