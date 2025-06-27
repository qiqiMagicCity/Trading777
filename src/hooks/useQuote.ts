import useSWR from 'swr';

const token = import.meta.env.VITE_FINNHUB_TOKEN as string;

async function fetchQuote(symbol: string) {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${token}`);
  if (!res.ok) throw new Error('finnhub error');
  return res.json() as Promise<{c:number, pc:number}>;
}

export function useQuote(symbol: string, refresh = 10000){
  return useSWR(['quote', symbol], () => fetchQuote(symbol), { refreshInterval: refresh });
}
