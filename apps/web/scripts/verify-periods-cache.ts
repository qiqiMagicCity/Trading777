import { computePeriods } from '../app/lib/metrics-periods';

// 数据集 A
const A = [
  { date: '2025-08-01', realized: 7850, unrealized: 1102.5 },
  { date: '2025-08-04', realized:   50, unrealized:   -10  },
];

// 首次计算
let p1 = computePeriods(A as any, '2025-08-04');
if (Math.abs(p1.M12 - (7850+1102.5+50-10)) > 1e-6) throw new Error('baseline wrong');

// 原地修改 A 的第一天 → 缓存必须失效
A[0].realized += 100;
let p2 = computePeriods(A as any, '2025-08-04');
if (Math.abs(p2.M12 - (7950+1102.5+50-10)) > 1e-6) throw new Error('in-place mutation not reflected');

// 数据集 B（与 A 当前内容相同但引用不同）→ 作用域隔离（不同 key），亦应正确
const B = JSON.parse(JSON.stringify(A));
let p3 = computePeriods(B as any, '2025-08-04');
if (Math.abs(p3.M12 - p2.M12) > 1e-6) throw new Error('dataset scoping wrong');

console.log('period cache verified ✅');
