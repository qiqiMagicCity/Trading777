
<template>
  <div class="page">
    <TopBar />

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else>
      <div v-if="hasData" class="kpi-row">
        <KpiCard title="账户持仓成本" :value="kpis.positionCost" :positive="kpis.positionCost > 0" :negative="kpis.positionCost < 0" @click="open('cost')" />
        <KpiCard title="当日盈亏统计" :value="kpis.dailyPnL" :positive="kpis.dailyPnL > 0" :negative="kpis.dailyPnL < 0" @click="open('today')" />
        <KpiCard title="当日浮盈浮亏" :value="kpis.dailyUnrealized" :positive="kpis.dailyUnrealized > 0" :negative="kpis.dailyUnrealized < 0" @click="open('float')" />
        <KpiCard title="当日盈亏笔数" :value="kpis.dailyPnLCount" @click="open('pnlCnt')" />
        <KpiCard title="当日交易次数" :value="kpis.dailyTradeCount" @click="open('todayCnt')" />
        <KpiCard title="累计交易笔数" :value="kpis.cumulativeTradeCount" @click="open('total')" />
        <KpiCard title="WTD 盈亏" :value="kpis.wtdPnL" :positive="kpis.wtdPnL > 0" :negative="kpis.wtdPnL < 0" @click="open('wtd')" />
        <KpiCard title="MTD 盈亏" :value="kpis.mtdPnL" :positive="kpis.mtdPnL > 0" :negative="kpis.mtdPnL < 0" @click="open('mtd')" />
        <KpiCard title="YTD 盈亏" :value="kpis.ytdPnL" :positive="kpis.ytdPnL > 0" :negative="kpis.ytdPnL < 0" @click="open('ytd')" />
      </div>
      <div v-else class="no-data">暂无交易数据</div>
    </div>

    <AddTradeFab class="fab" @click="showAdd = true" />

    <Modal v-if="showAdd" @close="showAdd = false" title="添加交易">
      <AddTradeForm @submitted="onAddedTrade" />
    </Modal>

    <FooterBar />
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

const loading = ref(true)
const kpis = ref({})
const hasData = ref(false)
const showAdd = ref(false)

function open(section) {
  // TODO: open detail modal or route
}

async function load () {
  try {
    const { data: sessionData } = await supabase.auth.getUser()
    const user = sessionData?.user
    if (!user) {
      loading.value = false
      return
    }
    kpis.value = await getKpis(user.id)
    hasData.value = Object.keys(kpis.value).length > 0
  } catch (e) {
    console.error('Dashboard load error', e)
  } finally {
    loading.value = false
  }
}

function onAddedTrade () {
  showAdd.value = false
  loading.value = true
  load()
}

onMounted(load)
</script>

<style scoped>
.page{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  padding-top:48px;
}
.kpi-row{
  display:flex;
  flex-wrap:wrap;
  justify-content:center;
  margin:24px auto;
  max-width:1400px;
}
.loading,.no-data{
  margin:40px;
  font-size:18px;
}
.fab{
  position:fixed;
  bottom:100px;
  right:30px;
}
</style>
