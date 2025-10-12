import { formatMissingCloseLineTickersOnly } from '@/app/lib/missingClose';

describe('formatMissingCloseLineTickersOnly', () => {
  it('formats missing close banner lines with tickers only', () => {
    const missing: Record<string, Array<{ symbol: string; reason: string }>> = {
      '2025-09-19': [
        { symbol: 'AMD', reason: 'avg' },
        { symbol: 'BA', reason: 'avg' },
        { symbol: 'DIS', reason: 'avg' },
        { symbol: 'GOOGL', reason: 'avg' },
        { symbol: 'NVDL', reason: 'avg' },
        { symbol: 'PYPL', reason: 'avg' },
        { symbol: 'TSDD', reason: 'avg' },
        { symbol: 'UAL', reason: 'avg' },
      ],
      '2025-10-03': [
        { symbol: 'AMZN', reason: 'prev' },
        { symbol: 'APP', reason: 'avg' },
        { symbol: 'BA', reason: 'prev' },
        { symbol: 'DIS', reason: 'prev' },
        { symbol: 'GOOGL', reason: 'prev' },
        { symbol: 'INTC', reason: 'prev' },
        { symbol: 'PYPL', reason: 'prev' },
        { symbol: 'SCHW', reason: 'avg' },
        { symbol: 'UAL', reason: 'prev' },
      ],
      '2025-10-06': [{ symbol: 'COST', reason: 'avg' }],
    };

    const lines = Object.keys(missing).map((date) =>
      formatMissingCloseLineTickersOnly(
        date,
        missing[date]!.map((entry) => entry.symbol),
      ),
    );

    expect(lines).toEqual([
      '2025-09-19：AMD、BA、DIS、GOOGL、NVDL、PYPL、TSDD、UAL',
      '2025-10-03：AMZN、APP、BA、DIS、GOOGL、INTC、PYPL、SCHW、UAL',
      '2025-10-06：COST',
    ]);
  });
});
