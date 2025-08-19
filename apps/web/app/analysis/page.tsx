'use client';
import * as React from 'react';

export default function AnalysisPage() {
  const isProdLike =
    typeof process !== 'undefined' &&
    (process.env.CI === 'true' || process.env.NODE_ENV === 'production');

  return (
    <div className="p-4 text-sm text-gray-500">
      {isProdLike
        ? 'Analysis 调试页在 CI/生产环境暂时禁用（占位页面）。'
        : '本地开发环境：Analysis 调试页占位版本。'}
    </div>
  );
}

