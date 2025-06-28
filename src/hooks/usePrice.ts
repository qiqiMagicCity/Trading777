import useSWR from 'swr'

interface QuoteResp {
  c: number   // current price
  pc: number  // previous close
}

const fetchPrice = async (symbol: string): Promise<QuoteResp> => {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${import.meta.env.VITE_FINNHUB_TOKEN}`)
  if (!res.ok) throw new Error('Price fetch failed')
  return res.json() as Promise<QuoteResp>
}

export const usePrice = (symbol: string) => {
  return useSWR(symbol ? ['price', symbol] : null, () => fetchPrice(symbol), {
    refreshInterval: 10000, // 10s
  })
}
