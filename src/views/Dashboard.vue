
<template>
  <div class="page">
    <TopBar />
    <div class="kpi-row">
      <KpiCard title="账户持仓成本" :value="null" @click="open('cost')"/>
      <KpiCard title="当天盈亏统计" :value="null" @click="open('today')"/>
      <KpiCard title="当日浮盈浮亏" :value="null" @click="open('float')"/>
      <KpiCard title="当日交易次数" :value="null" @click="open('todayCnt')"/>
      <KpiCard title="累计交易笔数" :value="null" @click="open('total')"/>
      <KpiCard title="MTD（月度盈亏）" :value="null" @click="open('mtd')"/>
      <KpiCard title="YTD（年度盈亏）" :value="null" @click="open('ytd')"/>
      <KpiCard title="日内盈亏" :value="null" @click="open('intraday')"/>
    </div>
    <Modal v-model:show="show">
      <template #title>{{ title }}</template>
      <div style="color:#333">功能占位，后续接入 Supabase 数据</div>
    </Modal>
    <div class="footer">
      <span class="green">© 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec</span>
      <span class="green">版本 v1.3.02</span>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import TopBar from '@/components/TopBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import Modal from '@/components/Modal.vue'
const show=ref(false)
const title=ref('')
function open(key){title.value='详情';show.value=true}
</script>
<style scoped>
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:24px auto;max-width:1400px}
.footer{width:100%;text-align:center;margin-top:40px;font-size:12px}
.footer .green{color:#00ff99;display:block}
</style>
