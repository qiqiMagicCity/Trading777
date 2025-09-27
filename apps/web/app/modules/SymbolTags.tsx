'use client';

import Link from 'next/link';

interface SymbolTagsProps {
  symbols: string[];
  realizedPnls?: Record<string, number>;
}

export function SymbolTags({ symbols, realizedPnls }: SymbolTagsProps) {
  if (!symbols || symbols.length === 0) {
    return null;
  }

  return (
    <div id="symbols-list" className="symbols-list">
      {symbols.map(symbol => (
        <Link
          key={symbol}
          href={`/stock?symbol=${symbol}`}
          className={`symbol-tag${(realizedPnls?.[symbol] ?? 0) < 0 ? ' negative' : ''}`}
        >
          {symbol}
        </Link>
      ))}
    </div>
  );
}
