
<template>
  <div class="page">
    <TopBar/>
    <div class="kpi-row">
      <KpiCard title="账户持仓成本" :value="null"/>
      <KpiCard title="当天盈亏统计" :value="null"/>
      <KpiCard title="当日浮盈浮亏" :value="null"/>
      <KpiCard title="当日交易次数" :value="null"/>
      <KpiCard title="累计交易笔数" :value="null"/>
      <KpiCard title="MTD（月度盈亏）" :value="null"/>
      <KpiCard title="YTD（年度盈亏）" :value="null"/>
      <KpiCard title="日内盈亏" :value="null"/>
    </div>
    <hr class="divider"/>
    <a @click.prevent="showForm = true" class="fab">添加交易</a>
    
    <Modal v-model:show="showForm">
      <AddTradeForm @saved="showForm = false" />
    </Modal>

    <FooterBar :version="'v1.3.06'"/>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const showForm = ref(false)
import TopBar from '@/components/TopBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import FooterBar from '@/components/FooterBar.vue'
import AddTradeForm from '@/components/AddTradeForm.vue'
</script>
<style scoped>
.page{padding-top:60px}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:24px auto;max-width:1400px}
.divider{width:90%;max-width:1400px;border:0;border-top:2px solid #00bfff;margin:40px auto}
.fab{position:fixed;right:24px;bottom:120px;background:#00ff99;color:#000;padding:12px 18px;border-radius:28px;font-weight:bold;text-decoration:none;box-shadow:0 0 12px #00ff99}
</style>
