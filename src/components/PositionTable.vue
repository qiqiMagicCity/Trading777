
<template>
  <table class="min-w-full divide-y divide-gray-200">
    <thead>
      <tr class="text-left text-xs uppercase text-gray-500 bg-gray-50">
        <th class="px-3 py-2">代码 / 股数</th>
        <th class="px-3 py-2">实时价</th>
        <th class="px-3 py-2">总成本</th>
        <th class="px-3 py-2">盈亏平衡</th>
        <th class="px-3 py-2">持仓成本</th>
        <th class="px-3 py-2">当日涨跌</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-200">
      <tr v-for="p in positions" :key="p.symbol">
        <td class="px-3 py-1 flex items-center space-x-2">
          <img :src="p.logo" class="w-6 h-6 rounded-full" />
          <span>{{ p.symbol }} · {{ p.qty.toFixed(3) }}</span>
        </td>
        <td class="px-3 py-1">{{ p.price.toFixed(2) }}</td>
        <td class="px-3 py-1">{{ (p.qty * p.avg_cost).toFixed(2) }}</td>
        <td class="px-3 py-1">{{ p.jVal.toFixed(2) }}</td>
        <td class="px-3 py-1">{{ p.avg_cost.toFixed(2) }}</td>
        <td class="px-3 py-1" :class="color(p.day_change)">{{ p.day_change.toFixed(2) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import useSWRV from 'swrv'
import { supabase } from '../supabaseClient'
import axios from 'axios'
import { computed } from 'vue'

const fetchPositions = async () => {
  const uid = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase.from('vw_positions').select('*').eq('user_id', uid)
  if (error) throw error
  return data
}

const { data: pos } = useSWRV('positions', fetchPositions, { refreshInterval: 60000 })
const positions = computed(() => pos.value || [])

function color (n) {
  return n > 0 ? 'text-emerald-500' : n < 0 ? 'text-red-500' : ''
}
</script>
