
import { supabase } from '../supabaseClient'
import { ref } from 'vue'
/**
 * useKpi - composable fetching kpi stats for the current user
 */
export function useKpi() {
  const kpi = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const fetchKpi = async () => {
    loading.value = true
    const { data, error: err } = await supabase.from('vw_kpi_stats').select('*').single()
    error.value = err
    kpi.value = data
    loading.value = false
  }
  fetchKpi()
  return { kpi, loading, error, refresh: fetchKpi }
}
