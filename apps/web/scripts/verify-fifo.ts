import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAll, RawTrade, ClosePriceMap } from '../app/lib/runAll';
import { computeFifo, type InitialPosition } from '../app/lib/fifo';
import { calcM5Split } from '../app/lib/m5-intraday';
import { calcM9FromDaily } from '../app/lib/metrics';
import { round2 } from '../app/lib/money';
import { computeM6, type PrevPosition, type QuoteNowPrev } from '../app/lib/m6';
import { nyDateStr } from '../app/lib/time';

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

type Position = { symbol: string; qty: number; avgPrice: number; last: number; prevClose?: number };
const positions: Position[] = [];
for (const [symbol, { qty, avgPrice }] of posMap.entries()) {
  if (!qty) continue;
  const last = closePrices[symbol]?.[evalDate] ?? avgPrice;
  let prevClose: number | undefined;
  const byDate = closePrices[symbol];
  if (byDate) {
    let candidate: string | null = null;
    for (const [date, price] of Object.entries(byDate)) {
      if (!Number.isFinite(price)) continue;
      if (date >= evalDate) continue;
      if (!candidate || date > candidate) candidate = date;
    }
    if (candidate) {
      const price = byDate[candidate];
      if (Number.isFinite(price)) prevClose = price;
    }
  }
  positions.push({ symbol, qty, avgPrice, last, prevClose });
}

const positionBySymbol = new Map<string, Position>();
for (const pos of positions) positionBySymbol.set(pos.symbol, pos);

const todayNetChange = new Map<string, number>();
const lastTradePriceToday = new Map<string, number>();
for (const trade of trades) {
  if ((trade as any)?.isInitialPosition) continue;
  const symbol = trade.symbol;
  if (!symbol) continue;
  const day = nyDateStr(trade.date);
  if (day !== evalDate) continue;
  const qtyRaw = Number(trade.qty ?? trade.quantity ?? 0);
  const qty = Math.abs(qtyRaw);
  if (!Number.isFinite(qty) || qty === 0) continue;
  const price = Number(trade.price);
  if (Number.isFinite(price)) {
    lastTradePriceToday.set(symbol, price);
  }
  const side = String(trade.side ?? trade.action ?? '').toUpperCase();
  let delta = 0;
  if (side === 'BUY' || side === 'COVER') delta = qty;
  else if (side === 'SELL' || side === 'SHORT') delta = -qty;
  else continue;
  todayNetChange.set(symbol, (todayNetChange.get(symbol) ?? 0) + delta);
}

const prevPositions: PrevPosition[] = [];
const quotes: QuoteNowPrev[] = [];
const symbolUniverse = new Set<string>([
  ...positionBySymbol.keys(),
  ...todayNetChange.keys(),
]);
for (const symbol of symbolUniverse) {
  const pos = positionBySymbol.get(symbol);
  const currentQty = Number(pos?.qty ?? 0);
  const delta = todayNetChange.get(symbol) ?? 0;
  const qtyPrev = currentQty - delta;
  if (!Number.isFinite(qtyPrev) || Math.abs(qtyPrev) <= 1e-6) continue;

  prevPositions.push({ symbol, qtyPrev });

  let now: number | undefined;
  if (pos && Number.isFinite(pos.last)) {
    now = pos.last;
  } else {
    const tradePrice = lastTradePriceToday.get(symbol);
    if (Number.isFinite(tradePrice)) now = tradePrice;
  }

  const prevClose =
    pos && Number.isFinite(pos.prevClose ?? NaN) ? (pos.prevClose as number) : undefined;

  quotes.push({ symbol, now, prevClose });
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
const M5_2_raw = split.fifo;
const M5_2 = round2(M5_2_raw);
const M4 = round2(split.historyRealized);
const prevRealizedTotal = round2(
  dailyResults
    .filter((row) => row.date < evalDate)
    .reduce((sum, row) => sum + Number(row.realized ?? 0), 0),
);
const m6Calc = computeM6({
  m4UntilPrevClose: prevRealizedTotal,
  m5FifoToday: M5_2_raw,
  prevPositions,
  quotes,
});
const dayPriceChange = round2(m6Calc.mtmSum);
const M6 = round2(m6Calc.m6);
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
