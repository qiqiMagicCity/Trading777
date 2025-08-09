let _logged = false;

export function getFrozenClose(symbol: string): number | null {
  const freeze = process.env.NEXT_PUBLIC_FREEZE_DATE;
  if (!freeze) return null;
  // 冻结场景固定当天键
  const key = '2025-08-01';
  // 从 app/lib 到 public 的相对路径：../../public/close_prices.json
  // Jest/Node 环境下允许 require JSON
  // 若你的 tsconfig 未开启 resolveJsonModule，这种 require 方式最稳妥
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const closeMap = require('../../public/close_prices.json');
  const px = closeMap?.[symbol]?.[key];
  if (!_logged) {
    console.info('EVAL_FREEZE', { date: key, source: 'close_prices.json' });
    _logged = true;
  }
  if (px == null) {
    console.warn('EVAL_FREEZE_MISSING', { symbol, key });
    return null;
  }
  return px;
}
