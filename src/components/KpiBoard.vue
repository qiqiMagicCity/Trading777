
<template>
  <div class="grid md:grid-cols-4 gap-4">
    <div v-for="k in kpis" :key="k.label" class="bg-white p-4 rounded-2xl shadow flex flex-col">
      <span class="text-xs text-gray-500">{{ k.label }}</span>
      <span :class="valueColor(k.value)" class="text-2xl font-semibold">{{ format(k.value) }}</span>
    </div>
  </div>
</template>

<script setup>
import useSWRV from 'swrv'
import { supabase } from '../supabaseClient'
import { ref } from 'vue'

const fetcher = async () => {
  const uid = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase.from('vw_kpi_stats').select('*').eq('user_id', uid).single()
  if (error) throw error
  return data
}

const { data: kpi } = useSWRV('kpi', fetcher, { refreshInterval: 10000 })
const kpis = ref([
  { key: 'position_amount', label: '账户持仓金额', value: 0 },
  { key: 'intraday_realized', label: '日内交易统计', value: 0 },
  { key: 'intraday_unrealized_placeholder', label: '当日盈亏统计', value: 0 },
  { key: 'day_trades', label: '当日交易次数', value: 0 },
  { key: 'total_trades', label: '累计交易笔数', value: 0 },
  { key: 'wtd_pnl', label: 'WTD 盈亏', value: 0 },
  { key: 'mtd_pnl', label: 'MTD 盈亏', value: 0 },
  { key: 'ytd_pnl', label: 'YTD 盈亏', value: 0 }
])

watchEffect(() => {
  if (kpi.value) {
    kpis.value.forEach(k => k.value = kpi.value[k.key] || 0)
  }
})

function format (n) {
  return typeof n === 'number' ? n.toFixed(2) : n
}
function valueColor (n) {
  return n > 0 ? 'text-emerald-500' : n < 0 ? 'text-red-500' : 'text-gray-600'
}
</script>
