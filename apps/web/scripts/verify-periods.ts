import { computePeriods } from '../app/lib/metrics-periods';

const daily = [{ date: '2025-08-01', realized: 7850, unrealized: 1102.5 }];
const { M9, M11, M12, M13 } = computePeriods(daily, '2025-08-01');

console.log({ M9, M11, M12, M13 });

function eq(a:number,b:number){ return Math.abs(a-b) < 1e-6; }
if (!eq(M9, 7850)) throw new Error('M9 expected 7850');
if (!eq(M11, 8952.5)) throw new Error('M11 expected 8952.5');
if (!eq(M12, 8952.5)) throw new Error('M12 expected 8952.5');
if (!eq(M13, 8952.5)) throw new Error('M13 expected 8952.5');

console.log('period metrics verified ✅');
