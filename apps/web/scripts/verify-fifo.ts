import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAll, RawTrade, ClosePriceMap } from '../app/lib/runAll';
import { computeFifo, type InitialPosition } from '../app/lib/fifo';
import { calcM5Split } from '../app/lib/m5-intraday';
import { calcM9FromDaily } from '../app/lib/metrics';
import { calcM1M2M3 } from '../app/lib/metrics/calcM1M2M3';
import { round2 } from '../app/lib/money';
import { calcM6Detailed, type M6PositionInput } from '../app/lib/m6';
import { nyDateStr } from '../app/lib/time';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function readJSON(name: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../public', name), 'utf-8'),
  );
}

type RawTradeWithLegacy = RawTrade & {
  quantity?: number | string | null;
  action?: string | null;
};

const trades: RawTradeWithLegacy[] = readJSON('trades.json');
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

type Position = {
  symbol: string;
  qty: number;
  avgPrice: number;
  last: number;
  prevClose?: number;
  multiplier?: number;
};
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
}

type TodayLotBag = { long: { qty: number; price: number }[]; short: { qty: number; price: number }[] };
const todayLotBags = new Map<string, TodayLotBag>();

function getTodayBag(symbol: string): TodayLotBag {
  const existing = todayLotBags.get(symbol);
  if (existing) return existing;
  const bag: TodayLotBag = { long: [], short: [] };
  todayLotBags.set(symbol, bag);
  return bag;
}

function consumeLots(lots: { qty: number; price: number }[], qty: number) {
  let remain = qty;
  while (remain > 0 && lots.length > 0) {
    const lot = lots[0]!;
    const used = Math.min(lot.qty, remain);
    lot.qty -= used;
    remain -= used;
    if (lot.qty <= 1e-9) {
      lots.shift();
    }
  }
}

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
  if (!Number.isFinite(price)) continue;
  const side = String((trade as any)?.side ?? (trade as any)?.action ?? "").toUpperCase();
  const bag = getTodayBag(symbol);
  if (side === "BUY") {
    bag.long.push({ qty, price });
  } else if (side === "SHORT") {
    bag.short.push({ qty, price });
  } else if (side === "SELL") {
    consumeLots(bag.long, qty);
  } else if (side === "COVER") {
    consumeLots(bag.short, qty);
  }
}

const todayLotsSummary = new Map<
  string,
  { longQty: number; longAvg: number | undefined; shortQty: number; shortAvg: number | undefined }
>();

for (const [symbol, bag] of todayLotBags.entries()) {
  const longQty = bag.long.reduce((sum, lot) => sum + lot.qty, 0);
  const shortQty = bag.short.reduce((sum, lot) => sum + lot.qty, 0);
  const longCost = bag.long.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
  const shortCost = bag.short.reduce((sum, lot) => sum + lot.qty * lot.price, 0);
  todayLotsSummary.set(symbol, {
    longQty,
    longAvg: longQty > 0 ? longCost / longQty : undefined,
    shortQty,
    shortAvg: shortQty > 0 ? shortCost / shortQty : undefined,
  });
}

const positionsForM6: M6PositionInput[] = [];
for (const [symbol, pos] of positionBySymbol.entries()) {
  const qty = Number(pos?.qty ?? 0);
  if (!Number.isFinite(qty) || qty === 0) continue;
  const nowPrice = Number(pos?.last);
  const prevClose = Number(pos?.prevClose ?? NaN);
  const todayLots = todayLotsSummary.get(symbol);
  positionsForM6.push({
    symbol,
    qty,
    priceNow: Number.isFinite(nowPrice) ? nowPrice : null,
    prevClose: Number.isFinite(prevClose) ? prevClose : null,
    todayLongQty: todayLots?.longQty,
    todayLongAvg: todayLots?.longAvg,
    todayShortQty: todayLots?.shortQty,
    todayShortAvg: todayLots?.shortAvg,
    overnightQty:
      todayLots && Number.isFinite(qty)
        ? qty - (todayLots.longQty ?? 0) + (todayLots.shortQty ?? 0)
        : undefined,
  });
}

const m123 = calcM1M2M3(positions as any);
const M1 = round2(m123.m1);
const M2 = round2(m123.m2);
const M3 = round2(m123.m3.nominal);
const split = calcM5Split(enriched as any, evalDate, initialPositions);
const M5_1 = round2(split.trade);
const M5_2_raw = split.fifo;
const M5_2 = round2(M5_2_raw);
const M4_raw = split.historyRealized;
const m6Calc = calcM6Detailed({
  positions: positionsForM6,
  M4: M4_raw,
  M5_FIFO: M5_2_raw,
  nowMarkFallback: (symbol) => {
    const tradePrice = lastTradePriceToday.get(symbol);
    return Number.isFinite(tradePrice) ? Number(tradePrice) : null;
  },
});
const dayPriceChange = round2(m6Calc.mtm);
const M6 = m6Calc.total;
const M4 = round2(M4_raw);
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
