
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
    <button class="fab-fixed" @click="showModal = true">添加交易</button>

    <!-- 弹窗 -->
    <Modal v-model:show="show">
      <template #title>{{ modalTitle }}</template>

<style scoped>
.stats-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(160px,1fr));
  gap:16px;
  justify-content:center;
  margin-top:16px;
}
</style>

      <div style="color:#333">功能占位，后续接入 Supabase 数据</div>
    </Modal>

    <!-- 页脚 -->
    
    <Modal v-model:show="showModal">
      <AddTradeForm v-if="showModal" @close="showModal=false" @saved="showModal=false" @cancel="showModal=false" />
    </Modal>

    <FooterBar />
  </div>
</template>

<style scoped>
.stats-grid{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(160px,1fr));
  gap:16px;
  justify-content:center;
  margin-top:16px;
}
</style>


<script setup>import { ref } from 'vue';

const showModal = ref(false);


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
}</script>



<style>
:root{
  --fab-right: var(--fab-right);
  --fab-bottom: var(--fab-bottom);
}
</style>
