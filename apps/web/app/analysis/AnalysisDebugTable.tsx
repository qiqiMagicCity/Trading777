'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

export default function AnalysisDebugTable() {
  const metrics = useStore(state => state.metrics);
  const logged = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (logged.current || !metrics) return;
    console.table({
      M1: metrics.M1,
      M2: metrics.M2,
      M3: metrics.M3,
      M4: metrics.M4,
      'M5.1': metrics.M5.trade,
      'M5.2': metrics.M5.fifo,
      M6: metrics.M6,
      M7: `B/${metrics.M7.B} S/${metrics.M7.S} P/${metrics.M7.P} C/${metrics.M7.C}`,
      M8: `B/${metrics.M8.B} S/${metrics.M8.S} P/${metrics.M8.P} C/${metrics.M8.C}`,
      M9: metrics.M9,
      M10: `W/${metrics.M10.win} L/${metrics.M10.loss} ${(metrics.M10.rate * 100).toFixed(1)}%`,
      M11: metrics.M11,
      M12: metrics.M12,
      M13: metrics.M13,
    });
    logged.current = true;
  }, [metrics]);

  return null;
}

