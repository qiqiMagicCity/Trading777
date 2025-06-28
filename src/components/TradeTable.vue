
<template>
  <table class="min-w-full divide-y divide-gray-200">
    <thead>
      <tr class="text-left text-xs uppercase text-gray-500 bg-gray-50">
        <th class="px-3 py-2">时间</th>
        <th class="px-3 py-2">股票</th>
        <th class="px-3 py-2">动作</th>
        <th class="px-3 py-2">数量</th>
        <th class="px-3 py-2">价格</th>
        <th class="px-3 py-2">盈亏平衡</th>
        <th class="px-3 py-2">成交后持仓</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-200">
      <tr v-for="t in trades" :key="t.id">
        <td class="px-3 py-1">{{ new Date(t.trade_at).toLocaleString() }}</td>
        <td class="px-3 py-1">{{ t.symbol }}</td>
        <td class="px-3 py-1">
          <span :class="actionColor(t.action)" class="px-2 py-0.5 rounded-full text-white text-xs">{{ t.action }}</span>
        </td>
        <td class="px-3 py-1">{{ t.quantity }}</td>
        <td class="px-3 py-1">{{ t.price.toFixed(2) }}</td>
        <td class="px-3 py-1">{{ t.jVal?.toFixed?.(2) ?? '-' }}</td>
        <td class="px-3 py-1">{{ t.netAfter?.toFixed?.(3) ?? '-' }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import useSWRV from 'swrv'
import { supabase } from '../supabaseClient'
import { computed } from 'vue'

const fetchTrades = async () => {
  const uid = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase.from('vw_trades_latest').select('*').eq('user_id', uid).limit(50)
  if (error) throw error
  return data
}

const { data: tr } = useSWRV('trades', fetchTrades, { refreshInterval: 10000 })
const trades = computed(() => tr.value || [])

function actionColor (a) {
  if (a === 'BUY') return 'bg-emerald-500'
  if (a === 'SELL') return 'bg-red-500'
  if (a === 'SHORT') return 'bg-purple-500'
  return 'bg-orange-500'
}
</script>
