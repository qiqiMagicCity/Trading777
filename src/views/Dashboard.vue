
<template>
  <div class="page">
    <TopBar />

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="kpi-row">
      <KpiCard title="账户持仓成本" :value="kpis.positionCost" :positive="kpis.positionCost>0" :negative="kpis.positionCost<0" @click="open('cost')" />
      <KpiCard title="当日盈亏统计" :value="kpis.dailyPnL" :positive="kpis.dailyPnL>0" :negative="kpis.dailyPnL<0" @click="open('today')" />
      <KpiCard title="当日浮盈浮亏" :value="kpis.dailyUnrealized" :positive="kpis.dailyUnrealized>0" :negative="kpis.dailyUnrealized<0" @click="open('float')" />
      <KpiCard title="当日盈亏笔数" :value="kpis.dailyPnLCount" @click="open('pnlCnt')" />
      <KpiCard title="当日交易次数" :value="kpis.dailyTradeCount" @click="open('todayCnt')" />
      <KpiCard title="累计交易笔数" :value="kpis.cumulativeTradeCount" @click="open('total')" />
      <KpiCard title="WTD 盈亏" :value="kpis.wtdPnL" :positive="kpis.wtdPnL>0" :negative="kpis.wtdPnL<0" @click="open('wtd')" />
      <KpiCard title="MTD 盈亏" :value="kpis.mtdPnL" :positive="kpis.mtdPnL>0" :negative="kpis.mtdPnL<0" @click="open('mtd')" />
      <KpiCard title="YTD 盈亏" :value="kpis.ytdPnL" :positive="kpis.ytdPnL>0" :negative="kpis.ytdPnL<0" @click="open('ytd')" />
    </div>

    <hr class="divider" />

    <Modal v-model:show="show">
      <template #title>{{ modalTitle }}</template>
      <div style="color:#333">功能占位，后续接入 Supabase 数据详情</div>
    </Modal>

    <Modal v-model:show="showModal">
      <AddTradeForm v-if="showModal" @close="showModal=false" @saved="showModal=false" @cancel="showModal=false" />
    </Modal>

    <FooterBar />
    <AddTradeForm v-if="showModal" @close="showModal=false" />
    <AddTradeFab @open="showModal=true" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import Modal from '@/components/Modal.vue'
import FooterBar from '@/components/FooterBar.vue'
import AddTradeForm from '@/components/AddTradeForm.vue'
import AddTradeFab from '@/components/AddTradeFab.vue'
import { getKpis } from '@/services/kpiService'
import { supabase } from '@/utils/supabaseClient'

const show = ref(false)
const showModal = ref(false)
const modalTitle = ref('详情')

const loading = ref(true)
const kpis = ref({})

function open(key){
  modalTitle.value = key
  show.value = true
}

async function load(){
  const user = supabase.auth.user()
  if(!user){
    loading.value = false
    return
  }
  kpis.value = await getKpis(user.id)
  loading.value = false
}

onMounted(load)
</script>

<style scoped>
.page{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:48px;}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:24px auto;max-width:1400px}
.divider{width:90%;max-width:1400px;border:0;border-top:1px solid rgba(0,255,128,0.35);margin:40px auto}
.loading{margin:40px;font-size:18px}
</style>
