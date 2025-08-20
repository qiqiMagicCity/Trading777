import runAll from '../app/lib/runAll';

const initial = [
  { symbol: 'NFLX', qty: 100, avgPrice: 1100 }, // 历史多头
];

const closePrices = {
  NFLX: { '2025-08-01': 1158.60 },
};

const trades = [
  { date: '2025-08-01T09:10:00-04:00', side: 'BUY',   symbol: 'NFLX', qty: 50,  price: 1160 },
  { date: '2025-08-01T10:40:00-04:00', side: 'SELL',  symbol: 'NFLX', qty: 120, price: 1155 },
];

const res = runAll('2025-08-01', initial as any, trades as any, closePrices as any, { dailyResults: [] }, { evalDate: '2025-08-01' });

console.log('M4=', res.M4, 'M5_1=', res.M5_1, 'M5_2=', res.M5_2);

// 期望：100（历史）进 M4，20（当日）进 M5
const eq = (a:number,b:number)=>Math.abs(a-b) < 1e-6;
if (!eq(res.M4, 100 * (1155 - 1100)))   throw new Error('M4 not split to history correctly');
if (!eq(res.M5_1, (1155 - 1160) * 20)) throw new Error('M5.1 not behavior-split correctly');
if (!eq(res.M5_2, (1155 - 1160) * 20)) throw new Error('M5.2 not fifo-split correctly');

console.log('m5 overflow split verified ✅');
