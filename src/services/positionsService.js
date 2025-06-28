
import { supabase } from '../supabaseClient'
import { ref } from 'vue'
import { fetchQuote } from './finnhubService'

export function usePositions() {
  const positions = ref([])
  const loading = ref(false)
  const error = ref(null)
  const fetchPositions = async () => {
    loading.value = true
    const { data, error: err } = await supabase
      .from('vw_positions')
      .select('*')
      .order('symbol', {ascending: true})
    loading.value = false
    error.value = err
    positions.value = data || []
    // fetch realtime price for each symbol in parallel
    for (const p of positions.value) {
      const quote = await fetchQuote(p.symbol)
      p.price = quote.price
      p.prevClose = quote.prevClose
      p.priceTime = quote.time
    }
  }
  fetchPositions()
  return { positions, loading, error, refresh: fetchPositions }
}
