import type { Trade } from './services/dataService';
import { toNY } from './timezone';
import { MoneyDecimal as M, avgPrice, realizedPnLLong, realizedPnLShort } from './money';

const EPSILON = 1e-6;

type Position = {
  price: number;
  quantity: number;
};

type TradeDirection = 'NONE' | 'LONG' | 'SHORT';
type PositionDirection = Exclude<TradeDirection, 'NONE'>;

type SymbolState = {
  positionList: Position[];
  direction: TradeDirection;
  accumulatedRealizedPnl: number;
  accumulatedTotalCost: number;
  tradeCount: number;
  breakEvenJSticky?: number;
  breakEvenJStickyDirection?: PositionDirection;
  lastDirection?: PositionDirection;
};

export type EnrichedTrade = Trade & {
  id?: number; // 确保包含ID
  weekday: number;
  tradeCount: number;
  amount: number;
  breakEvenPrice: number;
  realizedPnl: number;
  quantityAfter: number;
  averageCost: number;
  breakEvenJ?: number;
  breakEvenJSticky?: number;
  breakEvenDirection?: PositionDirection;
  breakEvenDirectionSticky?: PositionDirection;
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
    const direction = pos.qty < 0 ? 'SHORT' : 'LONG';
    const accumulatedTotalCost = direction === 'SHORT'
      ? new M(pos.avgPrice).mul(quantity).mul(-1).toNumber()
      : new M(pos.avgPrice).mul(quantity).toNumber();
    const netAbs = quantity;
    let initialJ: number | undefined;
    if (netAbs > EPSILON) {
      initialJ = direction === 'SHORT'
        ? new M(accumulatedTotalCost).mul(-1).div(netAbs).toNumber()
        : new M(accumulatedTotalCost).div(netAbs).toNumber();
    }
    symbolStateMap[pos.symbol] = {
      positionList: [{ price: pos.avgPrice, quantity }],
      direction,
      accumulatedRealizedPnl: 0,
      accumulatedTotalCost,
      tradeCount: 0,
      breakEvenJSticky: initialJ,
      breakEvenJStickyDirection: direction === 'NONE' ? undefined : direction,
      lastDirection: direction === 'NONE' ? undefined : direction,
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
      breakEvenJSticky: undefined,
      breakEvenJStickyDirection: undefined,
      lastDirection: undefined,
    });

    state.tradeCount += 1;
    let realizedPnl = 0;
    const { price, action } = trade;
    const quantity = Math.abs(trade.quantity);

    if (action === 'buy' || action === 'cover') {
      if (state.direction === 'NONE' || state.direction === 'LONG') {
        state.positionList.push({ price, quantity });
        state.direction = 'LONG';
        state.lastDirection = 'LONG';
        state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
          .plus(new M(price).mul(quantity))
          .toNumber();
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
          state.lastDirection = 'LONG';
          state.accumulatedTotalCost = new M(price)
            .mul(remainingQuantity)
            .toNumber();
        } else if (state.positionList.length === 0) {
          state.direction = 'NONE';
          state.accumulatedTotalCost = 0;
        }
      }
    } else { // action is 'sell' or 'short'
      if (state.direction === 'NONE' || state.direction === 'SHORT') {
        state.positionList.push({ price, quantity });
        state.direction = 'SHORT';
        state.lastDirection = 'SHORT';
        state.accumulatedTotalCost = new M(state.accumulatedTotalCost)
          .minus(new M(price).mul(quantity))
          .toNumber();
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
          state.lastDirection = 'SHORT';
          state.accumulatedTotalCost = new M(price)
            .mul(remainingQuantity)
            .mul(-1)
            .toNumber();
        } else if (state.positionList.length === 0) {
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
    let breakEvenDirection: PositionDirection | undefined;
    let currentJ: number | undefined;
    if (netAbs > EPSILON) {
      if (state.direction === 'LONG') {
        breakEvenDirection = 'LONG';
        currentJ = new M(state.accumulatedTotalCost)
          .minus(state.accumulatedRealizedPnl)
          .div(netAbs)
          .toNumber();
      } else if (state.direction === 'SHORT') {
        breakEvenDirection = 'SHORT';
        currentJ = new M(state.accumulatedTotalCost)
          .mul(-1)
          .plus(state.accumulatedRealizedPnl)
          .div(netAbs)
          .toNumber();
      }
    }
    if (currentJ !== undefined && breakEvenDirection) {
      state.breakEvenJSticky = currentJ;
      state.breakEvenJStickyDirection = breakEvenDirection;
    }
    const breakEvenJ = currentJ;
    const breakEvenJSticky = state.breakEvenJSticky ?? undefined;
    const breakEvenDirectionSticky =
      breakEvenJSticky !== undefined
        ? (currentJ !== undefined && breakEvenDirection)
          ? breakEvenDirection
          : state.breakEvenJStickyDirection ?? state.lastDirection
        : undefined;
    const breakEvenPrice = breakEvenJ ?? 0;

    const date = toNY(trade.date);
    const weekday = ((date.getUTCDay() + 6) % 7) + 1; // Monday: 1, Sunday: 7

    return {
      ...trade,
      id: trade.id, // 确保保留原始ID
      weekday,
      tradeCount: state.tradeCount,
      amount: new M(price).mul(quantity).toNumber(),
      breakEvenPrice,
      realizedPnl,
      quantityAfter: netPosition,
      averageCost,
      breakEvenJ,
      breakEvenJSticky,
      breakEvenDirection,
      breakEvenDirectionSticky,
      accTotalCost: state.accumulatedTotalCost,
      accRealizedPnl: state.accumulatedRealizedPnl,
      netPosition,
    };
  });
}
