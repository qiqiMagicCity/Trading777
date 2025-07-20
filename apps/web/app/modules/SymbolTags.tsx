'use client';

import Link from 'next/link';

/**
 * 让两个写法都能用：
 *   ① <SymbolTags symbols={['AAPL','MSFT']} />
 *   ② <SymbolTags trades={tradesArray} />   // trades 里含有 symbol 字段
 */
interface SymbolTagsProps {
  symbols?: string[];
  trades?: { symbol: string }[];
}

export function SymbolTags({ symbols, trades }: SymbolTagsProps) {
  // 兼容两种来源
  const list: string[] = symbols
    ? symbols
    : trades
    ? trades.map(t => t.symbol)
    : [];

  // 去重 & 过滤空值
  const uniq = Array.from(new Set(list.filter(Boolean)));

  if (uniq.length === 0) {
    return null;
  }

  return (
    <div id="symbols-list" className="symbols-list">
      {uniq.map(symbol => (
        <Link
          key={symbol}
          href={`/stock?symbol=${symbol}`}
          className="symbol-tag"
        >
          {symbol}
        </Link>
      ))}
    </div>
  );
}
