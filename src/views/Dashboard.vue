
<template>
  <div class="page">
    <!-- 顶部栏 -->
    <TopBar />

    <!-- KPI 区域 -->
    <div class="kpi-row">
      <KpiCard title="账户持仓成本" :value="null" @click="open('cost')" />
      <KpiCard title="当天盈亏统计" :value="null" @click="open('today')" />
      <KpiCard title="当日浮盈浮亏" :value="null" @click="open('float')" />
      <KpiCard title="当日交易次数" :value="null" @click="open('todayCnt')" />
      <KpiCard title="累计交易笔数" :value="null" @click="open('total')" />
      <KpiCard title="MTD（月度盈亏）" :value="null" @click="open('mtd')" />
      <KpiCard title="YTD（年度盈亏）" :value="null" @click="open('ytd')" />
      <KpiCard title="日内盈亏" :value="null" @click="open('intraday')" />
    </div>

    <!-- 分割线 -->
    <hr class="divider" />

    <!-- 悬浮按钮 -->
    <button class="fab" @click="showForm = true">添加交易</button>

    <!-- 弹窗 -->
    <Modal v-model:show="show">
      <template #title>{{ modalTitle }}</template>
      <div style="color:#333">功能占位，后续接入 Supabase 数据</div>
    </Modal>

    <!-- 页脚 -->
    
    <Modal v-model:show="showForm">
      <AddTradeForm @saved="showForm = false" />
    </Modal>

    <FooterBar />
  </div>
</template>

<script setup>
import { ref } from 'vue'
const showForm = ref(false)
import TopBar from '@/components/TopBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import Modal from '@/components/Modal.vue'
import FooterBar from '@/components/FooterBar.vue'
import AddTradeForm from '@/components/AddTradeForm.vue'

const show = ref(false)
const modalTitle = ref('详情')
function open(key){
  modalTitle.value = '详情'
  show.value = true
}
</script>

<style scoped>
.page{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:48px;}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:flex-start;margin:24px auto;max-width:1400px}
.divider{width:90%;max-width:1400px;border:0;border-top:1px solid rgba(0,255,128,0.35);margin:40px auto}
.fab{
  position:fixed;
  right:24px;
  bottom:140px;
  background:#00ff99;
  color:#000;
  padding:12px 18px;
  border-radius:28px;
  font-weight:bold;
  text-decoration:none;
  box-shadow:0 0 12px #00ff99;
}
.fab:hover{background:#00e68a}
</style>
