'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

export default function AnalysisDebugTable() {
  const metrics = useStore(state => state.metrics);
  const shadowDiff = useStore(state => state.shadowDiff);
  const logged = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (logged.current || !metrics) return;
    console.table({
      M1: { value: metrics.M1, 'Shadow Δ': shadowDiff?.M1 ?? 0 },
      M2: { value: metrics.M2, 'Shadow Δ': shadowDiff?.M2 ?? 0 },
      M3: { value: metrics.M3, 'Shadow Δ': shadowDiff?.M3 ?? 0 },
      M4: { value: metrics.M4, 'Shadow Δ': shadowDiff?.M4 ?? 0 },
      'M5.1': { value: metrics.M5.trade, 'Shadow Δ': 0 },
      'M5.2': { value: metrics.M5.fifo, 'Shadow Δ': shadowDiff?.['M5.fifo'] ?? 0 },
      M6: { value: metrics.M6, 'Shadow Δ': shadowDiff?.M6 ?? 0 },
      M7: { value: `B/${metrics.M7.B} S/${metrics.M7.S} P/${metrics.M7.P} C/${metrics.M7.C}` },
      M8: { value: `B/${metrics.M8.B} S/${metrics.M8.S} P/${metrics.M8.P} C/${metrics.M8.C}` },
      M9: { value: metrics.M9, 'Shadow Δ': shadowDiff?.M9 ?? 0 },
      M10: { value: `W/${metrics.M10.win} L/${metrics.M10.loss} ${(metrics.M10.rate * 100).toFixed(1)}%`, 'Shadow Δ': shadowDiff?.winRate ?? 0 },
      M11: { value: metrics.M11 },
      M12: { value: metrics.M12 },
      M13: { value: metrics.M13 },
    });
    logged.current = true;
  }, [metrics]);

  return null;
}

