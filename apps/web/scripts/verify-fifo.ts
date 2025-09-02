import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAll, RawTrade, ClosePriceMap } from '../app/lib/runAll';
import { computeFifo, type InitialPosition } from '../app/lib/fifo';
import { calcM5Split } from '../app/lib/m5-intraday';
import { calcM9FromDaily } from '../app/lib/metrics';
import { round2 } from '../app/lib/money';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function readJSON(name: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../public', name), 'utf-8'),
  );
}

const trades: RawTrade[] = readJSON('trades.json');
const initialPositions: InitialPosition[] = readJSON('initial_positions.json');
const closePrices: ClosePriceMap = readJSON('close_prices.json');
const dailyResults: { date: string; realized: number; unrealized: number }[] = readJSON(
  'dailyResult.json',
);
const evalDate =
  dailyResults[dailyResults.length - 1]?.date || '2025-08-01';

const main = await runAll(
  evalDate,
  initialPositions,
  trades,
  closePrices,
  { dailyResults },
  { evalDate },
);

// Independent recomputation
const tradeObjs = trades.map((t) => ({
  symbol: t.symbol,
  price: t.price,
  quantity: t.qty,
  date: t.date,
  action: t.side.toLowerCase() as any,
}));
const enriched = computeFifo(tradeObjs, initialPositions);

const posMap = new Map<string, { qty: number; avgPrice: number }>();
for (const p of initialPositions) {
  posMap.set(p.symbol, { qty: p.qty, avgPrice: p.avgPrice });
}
for (const t of enriched) {
  posMap.set(t.symbol, { qty: t.quantityAfter, avgPrice: t.averageCost });
}

type Position = { symbol: string; qty: number; avgPrice: number; last: number };
const positions: Position[] = [];
for (const [symbol, { qty, avgPrice }] of posMap.entries()) {
  if (!qty) continue;
  const last = closePrices[symbol]?.[evalDate] ?? avgPrice;
  positions.push({ symbol, qty, avgPrice, last });
}

const M1 = round2(positions.reduce((s, p) => s + Math.abs(p.avgPrice * p.qty), 0));
const M2 = round2(positions.reduce((s, p) => s + Math.abs(p.last * p.qty), 0));
const M3 = round2(
  positions.reduce((s, p) => {
    const qty = Math.abs(p.qty);
    return p.qty >= 0
      ? s + (p.last - p.avgPrice) * qty
      : s + (p.avgPrice - p.last) * qty;
  }, 0),
);
const split = calcM5Split(enriched as any, evalDate, initialPositions);
const M5_1 = round2(split.trade);
const M5_2 = round2(split.fifo);
const M4 = round2(split.historyRealized);
const M6 = round2(M4 + M3 + M5_2);
const M9 = round2(calcM9FromDaily(dailyResults, evalDate));

const ours: Record<string, number> = {
  M1,
  M2,
  M3,
  M4,
  M5_1,
  M5_2,
  M6,
  M9,
};

const tol = 0.01;
for (const [k, v] of Object.entries(ours)) {
  const target = (main as any)[k];
  if (typeof target !== 'number') continue;
  if (Math.abs(v - target) > tol) {
    throw new Error(`${k} mismatch: expected ${target}, got ${v}`);
  }
}

console.log('✅ fifo metrics verified');
