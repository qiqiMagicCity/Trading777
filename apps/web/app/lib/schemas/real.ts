import { z } from 'zod';

export const Trade = z.object({
  date: z.string(),
  time: z.string().optional(),
  symbol: z.string(),
  side: z.string(),
  qty: z.number().finite(),
  price: z.number().finite(),
});

export const Price = z.object({
  date: z.string(),
  symbol: z.string(),
  close: z.number().finite(),
});

export const Position = z.object({
  symbol: z.string(),
  qty: z.number().finite(),
  avgPrice: z.number().finite(),
});

export const DailyResult = z.object({
  date: z.string(),
  realized: z.number().finite(),
  unrealized: z.number().finite(),
  stale: z.boolean().optional(),
}).passthrough();

export const Trades = z.array(Trade);
export const Prices = z.array(Price);
export const PriceMap = z.record(z.record(z.number().finite()));
export const Positions = z.array(Position);
export const DailyResults = z.array(DailyResult);

export type TradeT = z.infer<typeof Trade>;
export type PriceT = z.infer<typeof Price>;
export type PositionT = z.infer<typeof Position>;
export type DailyResultT = z.infer<typeof DailyResult>;
