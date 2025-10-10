import { normalizeCloseMap } from '../normalizeCloseMap';

describe('normalizeCloseMap', () => {
  it('保持 by-date 结构并清洗数据', () => {
    const input = {
      '2024-01-01': { aapl: '189.55', GOOG: 132.5, INVALID: 'foo' },
      '2024-01-02': { msft: null, AMZN: 'not-a-number', TSLA: 248.5 },
      BAD: { ABC: 1 },
    } as const;

    expect(normalizeCloseMap(input)).toEqual({
      '2024-01-01': { AAPL: 189.55, GOOG: 132.5 },
      '2024-01-02': { TSLA: 248.5 },
    });
  });

  it('将 by-symbol 结构转成 by-date', () => {
    const input = {
      AAPL: {
        '2024-01-01': '189.55',
        '2024-01-02': 190.0,
        foo: 1,
      },
      tsla: {
        '2024-01-02': '248.5',
      },
      INVALID: 'ignore me',
    } as const;

    expect(normalizeCloseMap(input)).toEqual({
      '2024-01-01': { AAPL: 189.55 },
      '2024-01-02': { AAPL: 190, TSLA: 248.5 },
    });
  });

  it('忽略无效输入', () => {
    expect(normalizeCloseMap(null)).toEqual({});
    expect(normalizeCloseMap(undefined)).toEqual({});
    expect(normalizeCloseMap('not-object' as unknown as Record<string, unknown>)).toEqual({});
  });
});
