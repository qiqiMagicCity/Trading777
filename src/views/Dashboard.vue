<template>
  <div class="dashboard-container">
    <div class="kpi-grid">
      <KpiCard title="账户成本" :value="stats.accountCost" />
      <KpiCard title="当日盈亏" :value="stats.dailyPnL" />
      <KpiCard title="未实现盈亏" :value="stats.unrealizedPnL" />
      <KpiCard title="累计笔数" :value="stats.totalTrades" />
      <KpiCard title="MTD 盈亏" :value="stats.mtdPnL" />
      <KpiCard title="YTD 盈亏" :value="stats.ytdPnL" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import supabase from '@/plugins/supabase'
import KpiCard from '@/components/KpiCard.vue'

const stats = ref({
  accountCost: 0,
  dailyPnL: 0,
  unrealizedPnL: 0,
  totalTrades: 0,
  mtdPnL: 0,
  ytdPnL: 0
})

async function fetchStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) {
    console.error('Failed to fetch dashboard stats:', error)
  } else {
    Object.assign(stats.value, data)
  }
}

onMounted(() => {
  fetchStats()
})
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
}
</style>
