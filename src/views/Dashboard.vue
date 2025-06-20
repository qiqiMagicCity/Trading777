
<template>
  <section class="dashboard">
    <div class="kpi-row">
      <KpiCard title="账户持仓成本" :value="null" @click="openModal('cost')" />
      <KpiCard title="当天盈亏统计" :value="null" @click="openModal('todayPnL')" />
      <KpiCard title="当日浮盈浮亏" :value="null" @click="openModal('floatPnL')" />
      <KpiCard title="当日交易次数" :value="null" @click="openModal('todayTrades')" />
      <KpiCard title="累计交易笔数" :value="null" @click="openModal('totalTrades')" />
      <KpiCard title="MTD（月度盈亏）" :value="null" @click="openModal('mtd')" />
      <KpiCard title="YTD（年度盈亏）" :value="null" @click="openModal('ytd')" />
      <KpiCard title="日内盈亏" :value="null" @click="openModal('intraday')" />
    </div>

    <Modal v-model:show="showModal">
      <template #title>{{ modalTitle }}</template>
      <div>功能占位，后续接入 Supabase 数据</div>
    </Modal>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import KpiCard from '@/components/KpiCard.vue'
import Modal from '@/components/Modal.vue'

const showModal = ref(false)
const modalTitle = ref('')

function openModal(key){
  const map = {
    cost:'账户持仓成本明细',
    todayPnL:'当日盈亏明细',
    floatPnL:'浮盈浮亏明细',
    todayTrades:'当日交易次数明细',
    totalTrades:'累计交易笔数明细',
    mtd:'月度盈亏明细',
    ytd:'年度盈亏明细',
    intraday:'日内盈亏明细'
  }
  modalTitle.value = map[key] || '详情'
  showModal.value = true
}
</script>

<style scoped>
.dashboard{
  width:100%;
  max-width:1400px;
  display:flex;
  flex-direction:column;
  align-items:center;
}
.kpi-row{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  margin-bottom:40px;
}
</style>
