
import axios from 'axios'
const apiKey = import.meta.env.VITE_FINNHUB_KEY

/**
 * fetchQuote - returns { price, prevClose, time }
 */
export async function fetchQuote(symbol) {
  if (!apiKey) return { price: '--', prevClose: '--', time: '' }
  const { data } = await axios.get(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
  return {
    price: data.c || '--',
    prevClose: data.pc || '--',
    time: data.t ? new Date(data.t * 1000).toLocaleString() : ''
  }
}

export const fetchPrice = fetchQuote // backward compatibility

/**
 * fetchProfile - returns { name, logo }
 */
export async function fetchProfile(symbol) {
  if (!apiKey) return { name: symbol }
  const { data } = await axios.get(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`)
  return { name: data.name || symbol, logo: data.logo }
}

export async function searchSymbols(query) {
  if (!apiKey || !query) return []
  const { data } = await axios.get(`https://finnhub.io/api/v1/search?q=${query}&token=${apiKey}`)
  return data.result || []
}
