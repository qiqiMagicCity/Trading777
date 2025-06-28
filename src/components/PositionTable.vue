<template>
<table v-if="rows && rows.length" class="min-w-full text-sm">
  <thead>
    <tr class="text-left">
      <th class="p-2">股票</th>
      <th class="p-2">实时价</th>
      <th class="p-2">总成本</th>
      <th class="p-2">盈亏平衡点</th>
      <th class="p-2">持仓成本</th>
      <th class="p-2">当日涨跌</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="p in rows" :key="p.symbol">
      <td class="p-2 flex items-center gap-2">
        <img :src="p.logo" class="w-6 h-6" />
        {{ p.symbol }} × {{ formatQty(p.qty) }}
      </td>
      <td class="p-2"> {{ formatPrice(p.price) }} </td>
      <td class="p-2"> {{ formatMoney(p.total_cost) }} </td>
      <td class="p-2"> {{ formatPrice(p.jVal) }} </td>
      <td class="p-2"> {{ formatPrice(p.avg_cost) }} </td>
      <td class="p-2" :class="colorCls(p.day_change)"> {{ formatMoney(p.day_change) }} </td>
    </tr>
  </tbody>
</table>
<p v-else class="text-center text-gray-400 py-4">暂无持仓</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { numberColor } from '@/utils/numberColor'

const props = defineProps<{ rows: any[] }>()
const formatPrice = (v:number|null)=> v==null ? '--' : v.toFixed(2)
const formatMoney = formatPrice
const formatQty = (v:number)=> v.toFixed(3).replace(/\.000$/,'')
const colorCls = (v:number)=> numberColor(v)
</script>
