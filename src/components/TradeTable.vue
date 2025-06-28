<template>
<table v-if="rows && rows.length" class="min-w-full text-sm">
  <thead>
    <tr>
      <th class="p-2">时间</th>
      <th class="p-2">股票</th>
      <th class="p-2">动作</th>
      <th class="p-2">数量</th>
      <th class="p-2">价格</th>
      <th class="p-2">盈亏平衡点</th>
      <th class="p-2">成交后持仓</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="t in rows" :key="t.id">
      <td class="p-2">{{ new Date(t.trade_at).toLocaleString() }}</td>
      <td class="p-2">{{ t.symbol }}</td>
      <td class="p-2" :class="actionCls(t.action)">{{ t.action }}</td>
      <td class="p-2">{{ t.quantity }}</td>
      <td class="p-2">{{ t.price.toFixed(2) }}</td>
      <td class="p-2">{{ t.j_val?.toFixed(2) ?? '--' }}</td>
      <td class="p-2">{{ t.net_after ?? '--' }}</td>
    </tr>
  </tbody>
</table>
<p v-else class="text-center text-gray-400 py-4">暂无交易记录</p>
</template>

<script setup lang="ts">
const props = defineProps<{ rows: any[] }>()
const actionCls = (a:string)=> a==='BUY'||a==='COVER'?'text-emerald-400':'text-red-400'
</script>
