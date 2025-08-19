'use client';

import * as React from 'react';

function AnalysisDebugTableInner() {
  const isProdLike = typeof process !== 'undefined' &&
    (process.env.CI === 'true' || process.env.NODE_ENV === 'production');

  return (
    <div className="p-4 text-sm text-gray-500">
      {isProdLike
        ? 'Analysis Debug Table 在 CI/生产环境暂时禁用（占位组件）。请在本地开发环境查看完整调试表。'
        : '本地开发环境：占位版本已加载。'}
    </div>
  );
}

export const AnalysisDebugTable = AnalysisDebugTableInner;
export default AnalysisDebugTableInner;
