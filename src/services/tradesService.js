
import { supabase } from '../supabaseClient'
import { ref } from 'vue'

export function useLatestTrades(limit=50) {
  const trades = ref([])
  const loading = ref(false)
  const error = ref(null)
  const fetchTrades = async () => {
    loading.value = true
    const { data, error: err } = await supabase
      .from('vw_trades_latest')
      .select('*')
      .order('trade_at', {ascending: false})
      .limit(limit)
    loading.value = false
    trades.value = data || []
    error.value = err
  }
  fetchTrades()
  return { trades, loading, error, refresh: fetchTrades }
}
