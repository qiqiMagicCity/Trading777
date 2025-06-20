<template>
<TopBar/>
<div class='page'>
  <div class='kpi-row'>
    <KpiCard>账户持仓成本<br>暂无数据</KpiCard>
    <KpiCard>当天盈亏统计<br>暂无数据</KpiCard>
    <KpiCard>当日浮盈浮亏<br>暂无数据</KpiCard>
    <KpiCard>当日交易次数<br>暂无数据</KpiCard>
    <KpiCard>累计交易笔数<br>暂无数据</KpiCard>
    <KpiCard>MTD（月度盈亏）<br>暂无数据</KpiCard>
    <KpiCard>YTD（年度盈亏）<br>暂无数据</KpiCard>
    <KpiCard>日内盈亏<br>暂无数据</KpiCard>
  </div>
  <hr class='divider'/>
</div>
<button class='fab' @click='show=true'>添加交易</button>
<Modal v-model:show='show'><AddTradeForm/></Modal>
<FooterBar/>
</template>
<script setup>
import {ref} from 'vue'
import TopBar from '@/components/TopBar.vue'
import FooterBar from '@/components/FooterBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import Modal from '@/components/Modal.vue'
import AddTradeForm from '@/components/AddTradeForm.vue'
const show=ref(false)
</script>
<style scoped>
.page{padding-top:64px}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:16px auto 0 auto;max-width:1400px}
.divider{width:90%;border-top:1px solid rgba(0,255,128,0.35);margin:32px auto}
.fab{position:fixed;right:24px;bottom:100px;background:#0f0;color:#000;border-radius:24px;padding:12px 20px;font-weight:bold;box-shadow:0 0 10px #0f0;cursor:pointer}
</style>
