import { assertSchema } from '../schemas/assertSchema';
import { Trades } from '../schemas/real';

describe('schema validation', () => {
  it('reports path on invalid data', () => {
    const bad: any = [{ symbol: 'AAPL', side: 'BUY', qty: 1, price: 10 }];
    expect(() => assertSchema(bad, Trades)).toThrow(/0\.date/);
  });

  it('accepts valid sample', () => {
    const good = [{ date: '2024-01-01', symbol: 'AAPL', side: 'BUY', qty: 1, price: 10 }];
    expect(assertSchema(good, Trades)).toEqual(good);
  });
});
