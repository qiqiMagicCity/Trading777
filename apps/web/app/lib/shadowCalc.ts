export type HistPos = { sym: string; side: 'LONG' | 'SHORT'; qty: number; price?: number; cost?: number };
export type Trade = { t: string; sym: string; type: 'BUY' | 'SELL' | 'SHORT' | 'COVER'; qty: number; price: number };

// FIFO lot representation
interface Lot { qty: number; cost: number; }

type Book = Map<string, Lot[]>;

const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100;

function push(book: Book, sym: string, lot: Lot) {
  const arr = book.get(sym) || [];
  arr.push({ qty: lot.qty, cost: lot.cost });
  book.set(sym, arr);
}

function pop(book: Book, sym: string, qty: number): Lot[] {
  const arr = book.get(sym) || [];
  const out: Lot[] = [];
  let left = qty;
  while (left > 0 && arr.length) {
    const f = arr[0]!;
    const take = Math.min(left, f.qty);
    out.push({ qty: take, cost: f.cost });
    f.qty -= take;
    left -= take;
    if (f.qty === 0) arr.shift();
  }
  if (left > 0) throw new Error(`FIFO 不足: ${sym}, need ${left}`);
  book.set(sym, arr);
  return out;
}

export default function shadowCalc(
  hist: HistPos[],
  trades: Trade[],
  prices: Record<string, number>
): {
  M1: number;
  M2: number;
  M3: number;
  M4: number;
  M5: { fifo: number };
  M6: number;
  M9: number;
  winRate: number;
} {
  const Hlong: Book = new Map();
  const Hshort: Book = new Map();
  const Tlong: Book = new Map();
  const Tshort: Book = new Map();

  for (const h of hist) {
    const cost = typeof h.price === 'number' ? h.price : h.cost || 0;
    const lot = { qty: h.qty, cost };
    if (h.side === 'LONG') push(Hlong, h.sym, lot);
    else push(Hshort, h.sym, lot);
  }

  let M4 = 0;
  let M5f = 0;
  const realized: number[] = [];

  for (const tr of trades) {
    const { sym, type, qty, price } = tr;
    if (type === 'BUY') {
      push(Tlong, sym, { qty, cost: price });
    } else if (type === 'SHORT') {
      push(Tshort, sym, { qty, cost: price });
    } else if (type === 'SELL') {
      let left = qty;
      const today = Tlong.get(sym) || [];
      while (left > 0 && today.length) {
        const lot = today[0]!;
        const take = Math.min(left, lot.qty);
        const pnl = (price - lot.cost) * take;
        M5f += pnl;
        realized.push(pnl);
        lot.qty -= take;
        left -= take;
        if (lot.qty === 0) today.shift();
      }
      Tlong.set(sym, today);
      if (left > 0) {
        for (const lot of pop(Hlong, sym, left)) {
          const pnl = (price - lot.cost) * lot.qty;
          M4 += pnl;
          realized.push(pnl);
        }
      }
    } else if (type === 'COVER') {
      let left = qty;
      const today = Tshort.get(sym) || [];
      while (left > 0 && today.length) {
        const lot = today[0]!;
        const take = Math.min(left, lot.qty);
        const pnl = (lot.cost - price) * take;
        M5f += pnl;
        realized.push(pnl);
        lot.qty -= take;
        left -= take;
        if (lot.qty === 0) today.shift();
      }
      Tshort.set(sym, today);
      if (left > 0) {
        for (const lot of pop(Hshort, sym, left)) {
          const pnl = (lot.cost - price) * lot.qty;
          M4 += pnl;
          realized.push(pnl);
        }
      }
    }
  }

  const openLots: Array<{ sym: string; side: 'LONG' | 'SHORT'; qty: number; cost: number }> = [];
  const dump = (book: Book, side: 'LONG' | 'SHORT') => {
    for (const [sym, lots] of book) {
      for (const lot of lots) {
        if (lot.qty > 0) openLots.push({ sym, side, qty: lot.qty, cost: lot.cost });
      }
    }
  };
  dump(Hlong, 'LONG');
  dump(Tlong, 'LONG');
  dump(Hshort, 'SHORT');
  dump(Tshort, 'SHORT');

  let M1 = 0,
    M2 = 0,
    M3 = 0;
  for (const o of openLots) {
    const p = prices[o.sym] ?? 0;
    M1 += o.qty * o.cost;
    M2 += o.qty * p;
    M3 += o.side === 'LONG' ? (p - o.cost) * o.qty : (o.cost - p) * o.qty;
  }

  const wins = realized.filter((v) => v > 0).length;
  const losses = realized.filter((v) => v < 0).length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses) * 100) * 10) / 10 : 0;

  const M6 = r2(M4 + M5f + M3);
  const M9 = r2(M4 + M5f);

  return {
    M1: r2(M1),
    M2: r2(M2),
    M3: r2(M3),
    M4: r2(M4),
    M5: { fifo: r2(M5f) },
    M6,
    M9,
    winRate,
  };
}

