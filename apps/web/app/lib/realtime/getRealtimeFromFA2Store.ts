export type QuoteStore = { get: (symbol: string) => number | undefined };
let _store: QuoteStore | undefined;
export const bindRealtimeStore = (s: QuoteStore) => { _store = s };
export const getRealtimeFromFA2Store = (sym: string) => _store?.get(sym);
