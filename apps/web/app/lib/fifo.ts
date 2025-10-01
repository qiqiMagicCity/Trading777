import type { Trade } from './services/dataService';
import { toNY } from './timezone';
import { MoneyDecimal as M, avgPrice, realizedPnLLong, realizedPnLShort } from './money';

const EPSILON = 1e-6;

type Position = {
  price: number;
  quantity: number;
};

type SymbolState = {
  positionList: Position[];
  direction: 'NONE' | 'LONG' | 'SHORT';
  accumulatedRealizedPnl: number;
  accumulatedTotalCost: number;
  tradeCount: number;
  breakEvenJSticky?: number;
  lastDirectionBeforeFlat?: 'LONG' | 'SHORT';
};

export type EnrichedTrade = Trade & {
  id?: number; // 确保包含ID
  weekday: number;
  tradeCount: number;
  amount: number;
  breakEvenPrice?: number;
  breakEvenJ?: number;
  breakEvenJSticky?: number;
  realizedPnl: number;
  quantityAfter: number;
  averageCost: number;
  accTotalCost: number;
  accRealizedPnl: number;
  netPosition: number;
};

export type InitialPosition = {
  symbol: string;
  qty: number;
  avgPrice: number;
};

export function computeFifo(
  trades: Trade[],
  initialPositions: InitialPosition[] = [],
): EnrichedTrade[] {
  const symbolStateMap: Record<string, SymbolState> = {};

  for (const pos of initialPositions) {
    const quantity = Math.abs(pos.qty);
    if (quantity <= EPSILON) continue;
    symbolStateMap[pos.symbol] = {
      positionList: [{ price: pos.avgPrice, quantity }],
      direction: pos.qty < 0 ? 'SHORT' : 'LONG',
      accumulatedRealizedPnl: 0,
      accumulatedTotalCost: pos.qty < 0
        ? new M(pos.avgPrice).mul(quantity).mul(-1).toNumber()
        : new M(pos.avgPrice).mul(quantity).toNumber(),
      tradeCount: 0,
    };
  }

  // Sort trades by date to process them chronologically.
  // Trades with invalid or missing dates are placed last while
  // preserving their original insertion order.
  const sortedTrades = trades
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => {
      const timeA = toNY(a.t.date).getTime();
      const timeB = toNY(b.t.date).getTime();
      const aTime = isNaN(timeA) ? Infinity : timeA;
      const bTime = isNaN(timeB) ? Infinity : timeB;
      return aTime - bTime || a.idx - b.idx;
    })
    .map(({ t }) => t);

  return sortedTrades.map((trade): EnrichedTrade => {
    const state = symbolStateMap[trade.symbol] || (symbolStateMap[trade.symbol] = {
      positionList: [],
      direction: 'NONE',
      accumulatedRealizedPnl: 0,
      accumulatedTotalCost: 0,
      tradeCount: 0,
    });

    state.tradeCount += 1;
    let realizedPnl = 0;
    const { price, action } = trade;
    const quantity = Math.abs(trade.quantity);

    if (state.direction === 'NONE') {
      const nextDirection = action === 'sell' || action === 'short' ? 'SHORT' : 'LONG';
      if (state.lastDirectionBeforeFlat === nextDirection) {
        state.accumulatedRealizedPnl = 0;
      }
    }

    if (action === 'buy' || action === 'cover') {
      if (state.direction === 'NONE' || state.direction === 'LONG') {
        state.positionList.push({ price, quantity });
        state.direction = 'LONG';
        state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
          .plus(new M(price).mul(quantity))
          .toNumber();
        state.lastDirectionBeforeFlat = undefined;
      } else { // direction is 'SHORT', so this is a covering buy
        let remainingQuantity = quantity;
        while (remainingQuantity > EPSILON && state.positionList.length > 0) {
          const lot = state.positionList[0]!;
          const matchedQuantity = Math.min(remainingQuantity, lot.quantity);
          realizedPnl = new M(realizedPnl)
            .plus(realizedPnLShort(lot.price, price, matchedQuantity))
            .toNumber();
          state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
            .plus(new M(lot.price).mul(matchedQuantity))
            .toNumber();
          lot.quantity -= matchedQuantity;
          remainingQuantity -= matchedQuantity;
          if (lot.quantity <= EPSILON) {
            state.positionList.shift();
          }
        }
        state.accumulatedRealizedPnl = new M(state.accumulatedRealizedPnl)
          .plus(realizedPnl)
          .toNumber();
        if (remainingQuantity > EPSILON) {
          state.positionList = [{ price, quantity: remainingQuantity }];
          state.direction = 'LONG';
          state.accumulatedTotalCost = new M(price)
            .mul(remainingQuantity)
            .toNumber();
          state.lastDirectionBeforeFlat = undefined;
        } else if (state.positionList.length === 0) {
          state.lastDirectionBeforeFlat = 'SHORT';
          state.direction = 'NONE';
          state.accumulatedTotalCost = 0;
        }
      }
    } else { // action is 'sell' or 'short'
      if (state.direction === 'NONE' || state.direction === 'SHORT') {
        state.positionList.push({ price, quantity });
        state.direction = 'SHORT';
        state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
          .minus(new M(price).mul(quantity))
          .toNumber();
        state.lastDirectionBeforeFlat = undefined;
      } else { // direction is 'LONG', so this is a closing sell
        let remainingQuantity = quantity;
        while (remainingQuantity > EPSILON && state.positionList.length > 0) {
          const lot = state.positionList[0]!;
          const matchedQuantity = Math.min(remainingQuantity, lot.quantity);
          realizedPnl = new M(realizedPnl)
            .plus(realizedPnLLong(price, lot.price, matchedQuantity))
            .toNumber();
          state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
            .minus(new M(lot.price).mul(matchedQuantity))
            .toNumber();
          lot.quantity -= matchedQuantity;
          remainingQuantity -= matchedQuantity;
          if (lot.quantity <= EPSILON) {
            state.positionList.shift();
          }
        }
        state.accumulatedRealizedPnl = new M(state.accumulatedRealizedPnl)
          .plus(realizedPnl)
          .toNumber();
        if (remainingQuantity > EPSILON) {
          state.positionList = [{ price, quantity: remainingQuantity }];
          state.direction = 'SHORT';
          state.accumulatedTotalCost = new M(price)
            .mul(remainingQuantity)
            .mul(-1)
            .toNumber();
          state.lastDirectionBeforeFlat = undefined;
        } else if (state.positionList.length === 0) {
          state.lastDirectionBeforeFlat = 'LONG';
          state.direction = 'NONE';
          state.accumulatedTotalCost = 0;
        }
      }
    }

    const totalQuantityDec = state.positionList.reduce(
      (sum, p) => sum.plus(p.quantity),
      new M(0)
    );
    const costOfPositionsDec = state.positionList.reduce(
      (sum, p) => sum.plus(new M(p.price).mul(p.quantity)),
      new M(0)
    );

    const totalQuantity = totalQuantityDec.toNumber();
    const costOfPositions = costOfPositionsDec.toNumber();

    const averageCost = totalQuantity > EPSILON ? avgPrice(costOfPositions, totalQuantity, 4) : 0;
    const netPosition = state.direction === 'SHORT' ? -totalQuantity : totalQuantity;
    const netAbs = Math.abs(netPosition);
    const currentJ =
      netAbs > EPSILON
        ? new M(state.accumulatedTotalCost)
            .minus(state.accumulatedRealizedPnl)
            .div(netAbs)
            .toNumber()
        : undefined;

    if (currentJ !== undefined) {
      state.breakEvenJSticky = currentJ;
    }

    const breakEvenJSticky = state.breakEvenJSticky;

    const date = toNY(trade.date);
    const weekday = ((date.getUTCDay() + 6) % 7) + 1; // Monday: 1, Sunday: 7

    return {
      ...trade,
      id: trade.id, // 确保保留原始ID
      weekday,
      tradeCount: state.tradeCount,
      amount: new M(price).mul(quantity).toNumber(),
      breakEvenPrice: currentJ,
      breakEvenJ: currentJ,
      breakEvenJSticky,
      realizedPnl,
      quantityAfter: netPosition,
      averageCost,
      accTotalCost: state.accumulatedTotalCost,
      accRealizedPnl: state.accumulatedRealizedPnl,
      netPosition,
    };
  });
}
