import Decimal from 'decimal.js-light';

// 全局精度与四舍五入规则（2 位小数，HALF_UP）
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const D = (x: number | string | Decimal) => new Decimal(x);

// 对外保持 number；中间用 Decimal 计算
export const round2 = (n: Decimal | number | string): number =>
  new Decimal(n).toDecimalPlaces(2).toNumber();

// 乘法常用：价格 * 数量（数量可为整数/小数）
export const mul = (a: number | string, b: number | string) =>
  D(a).mul(b);

// PnL：多头/空头
export const realizedPnLLong = (sellPrice: number, costPrice: number, qty: number): number => {
  return D(sellPrice).minus(costPrice).mul(qty).toDecimalPlaces(2).toNumber();
};
export const realizedPnLShort = (shortPrice: number, coverPrice: number, qty: number): number => {
  return D(shortPrice).minus(coverPrice).mul(qty).toDecimalPlaces(2).toNumber();
};

// 均价：按金额/数量得平均成本价（保留 4 位，避免过早截断；最终展示时再 round2）
export const avgPrice = (totalCost: number | string, totalQty: number | string, scale = 4): number =>
  D(totalCost).div(totalQty).toDecimalPlaces(scale).toNumber();

// 金额加总
export const add = (...xs: Array<number | string>) =>
  xs.reduce((acc, x) => D(acc).plus(x).toNumber(), 0);

// 工具导出：内部计算可直接用 Decimal
export { Decimal as MoneyDecimal };
