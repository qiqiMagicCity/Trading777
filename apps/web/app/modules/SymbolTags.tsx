'use client';

import Link from 'next/link';

import SymbolLogo from '../components/SymbolLogo';

interface SymbolTagsProps {
  symbols: string[];
  realizedPnls?: Record<string, number>;
}

export function SymbolTags({ symbols, realizedPnls }: SymbolTagsProps) {
  if (!symbols || symbols.length === 0) {
    return null;
  }

  const sortedSymbols = [...symbols].sort((a, b) => {
    const pnlA = realizedPnls?.[a] ?? 0;
    const pnlB = realizedPnls?.[b] ?? 0;

    if (pnlA === pnlB) {
      return 0;
    }

    return pnlB - pnlA;
  });

  return (
    <div id="symbols-list" className="symbols-list">
      {sortedSymbols.map(symbol => (
        <Link
          key={symbol}
          href={`/stock?symbol=${symbol}`}
          className={`symbol-tag${(realizedPnls?.[symbol] ?? 0) < 0 ? ' negative' : ''}`}
        >
          <SymbolLogo
            symbol={symbol}
            width={18}
            height={18}
            className="symbol-tag__logo"
            alt={`${symbol} logo`}
          />
          <span className="symbol-tag__text">{symbol}</span>
        </Link>
      ))}
    </div>
  );
}
