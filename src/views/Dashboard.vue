<template>
  <div class='dashboard px-4'>
    <!-- KPI Section -->
    <section id='kpi-board' class='flex flex-wrap justify-center gap-4'>
      <KpiCard v-for='k in kpis' :key='k.id' :title='k.title' :value='k.value' />
    </section>

    <Divider />

    <!-- Positions Section -->
    <h2 class='text-lg font-semibold pb-2 text-center'>目前持仓</h2>
    <PositionTable :rows='positions'/>

    <Divider />

    <!-- Trades Section -->
    <h2 class='text-lg font-semibold pb-2 text-center'>交易记录</h2>
    <TradeTable :rows='trades'/>

    <AddTradeFab @click='openModal=true'/>

    <AddTradeModal v-model:visible='openModal' />
  </div>
</template>

<script setup lang='ts'>
import { ref } from 'vue'
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-vue'
import useSWRV from 'swrv'
import KpiCard from '@/components/KpiCard.vue'
import PositionTable from '@/components/PositionTable.vue'
import TradeTable from '@/components/TradeTable.vue'
import AddTradeFab from '@/components/AddTradeFab.vue'
import AddTradeModal from '@/components/AddTradeModal.vue'
import Divider from '@/components/Divider.vue'
import { fetcher } from '@/utils/fetcher'

const supabase = useSupabaseClient()
const { data: kpis } = useSWRV(() => supabase.from('vw_kpi_stats').select('*'), fetcher)
const { data: positions } = useSWRV(() => supabase.from('vw_positions').select('*'), fetcher)
const { data: trades } = useSWRV(() => supabase.from('vw_trades_latest').select('*'), fetcher)

const openModal = ref(false)
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
}
</style>
