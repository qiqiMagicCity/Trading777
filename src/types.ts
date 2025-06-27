export type TradeAction = 'BUY'|'SELL'|'SHORT'|'COVER';
export interface Trade {
  id:number;
  trade_at:string;
  symbol:string;
  action:TradeAction;
  quantity:number;
  price:number;
}
