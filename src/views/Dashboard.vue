<template>
  <div class="dashboard-root">
    <!-- 功能区1：KPI卡片区 -->
    <div class="kpi-cards">
      <div class="kpi-card" v-for="item in kpiList" :key="item.key">
        <div class="kpi-title">{{ item.label }}</div>
        <div class="kpi-value">{{ item.value !== null ? item.value : '暂无数据' }}</div>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="split-line"></div>

    <!-- 功能区2：持仓表格区 -->
    <PositionTable :positions="positionList" />

    <!-- 添加交易按钮 -->
    <button class="add-btn" @click="openRecord">添加交易</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import PositionTable from '@/components/PositionTable.vue'
import { getKpiData, getPositionList } from '@/services/statistics'

// KPI字段
const kpiList = ref([
  { key: 'accountCost', label: '账户持仓成本', value: null },
  { key: 'summary', label: '当天云统计', value: null },
  { key: 'dailyPnL', label: '当日浮盈浮亏', value: null },
  { key: 'tradeCount', label: '当日交易次数', value: null },
  { key: 'totalTradeCount', label: '累计交易笔数', value: null },
  { key: 'mtd', label: 'MTD（月度盈亏）', value: null },
  { key: 'ytd', label: 'YTD（年度盈亏）', value: null },
  { key: 'intraday', label: '日内盈亏', value: null }
])

const positionList = ref([])

const fetchAll = async () => {
  // 获取KPI
  const kpis = await getKpiData()
  kpiList.value.forEach(kpi => {
    kpi.value = kpis[kpi.key] ?? null
  })
  // 获取持仓
  positionList.value = await getPositionList()
}

const openRecord = () => {
  window.location.href = '/#/record'
}

onMounted(() => {
  fetchAll()
})
</script>

<style scoped>
.dashboard-root {
  width: 100%;
  min-height: 100vh;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.kpi-cards {
  margin-top: 30px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
}
.kpi-card {
  min-width: 180px;
  background: #0c1e2c;
  border: 2px solid #00e6ff;
  border-radius: 10px;
  box-shadow: 0 0 18px #00e6ff55;
  color: #00ffd0;
  text-align: center;
  padding: 12px 0;
  font-size: 1.18rem;
}
.kpi-title {
  font-size: 1rem;
  margin-bottom: 7px;
}
.kpi-value {
  font-size: 1.5rem;
  font-weight: bold;
}
.split-line {
  width: 82%;
  margin: 40px 0 32px 0;
  height: 4px;
  background: linear-gradient(90deg, #00ffc0cc 10%, #0098ff88 90%);
  border-radius: 2px;
  box-shadow: 0 0 16px #00ffd4cc;
}
.add-btn {
  margin: 32px auto 0 auto;
  padding: 12px 48px;
  border: none;
  border-radius: 999px;
  background: #007b59;
  color: #fff;
  font-size: 1.18rem;
  box-shadow: 0 0 8px #00ffddcc;
  cursor: pointer;
  transition: 0.18s;
}
.add-btn:hover {
  background: #00ffe0;
  color: #0c2;
}
</style>
