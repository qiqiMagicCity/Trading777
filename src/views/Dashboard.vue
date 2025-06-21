
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
    <button class="fab" @click="showModal = true">添加交易</button>

    <!-- 弹窗 -->
    <Modal v-model:show="show">
      <template #title>{{ modalTitle }}  <AddTradeFab @open="showModal=true" />
  <AddTradeForm v-if="showModal" @close="showModal=false" />
</template>
      <div style="color:#333">功能占位，后续接入 Supabase 数据</div>
    </Modal>

    <!-- 页脚 -->
    
    <Modal v-model:show="showModal">
      <AddTradeForm v-if="showModal" @close="showModal=false" @saved="showModal=false" @cancel="showModal=false" />
    </Modal>

    <FooterBar />
  </div>
  
  <AddTradeForm v-if="showModal" @close="showModal=false" />
</template>

<script setup>
import AddTradeFab from "@/components/AddTradeFab.vue";import { ref } from 'vue';

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

<style scoped>
.page{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:48px;}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:24px auto;max-width:1400px}
.divider{width:90%;max-width:1400px;border:0;border-top:1px solid rgba(0,255,128,0.35);margin:40px auto}

.fab:hover{background:#00e68a}

.fab{
  position:fixed;
  right:24px;
  bottom: 96px;
  padding:10px 20px;
  border-radius:28px;
  background:#00ffa2;
  border:2px solid #00ffa2;
  color:#000;
  font-weight:600;
  box-shadow:none;
  transition:background .3s;
}
.fab:hover{background:#12ffb0}
</style>

<style scoped>.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;justify-content:center;}</style>