
<template>
  <div class="page">
    <!-- 顶部栏 -->
    <TopBar />

    <!-- KPI 卡片 -->
    <div class="kpi-row">
      <KpiCard title="账户持仓金额" :value="kpi?.position_cost" :positive="kpi?.position_cost>0" />
      <KpiCard title="日内交易统计" :value="kpi?.intraday_realized" :positive="kpi?.intraday_realized>0" :negative="kpi?.intraday_realized<0" />
      <KpiCard title="当日盈亏统计" :value="kpi?.intraday_unreal" :positive="kpi?.intraday_unreal>0" :negative="kpi?.intraday_unreal<0" />
      <KpiCard title="当日交易次数" :value="kpi?.day_trades" />
      <KpiCard title="累计交易笔数" :value="kpi?.total_trades" />
      <KpiCard title="WTD 盈亏" :value="kpi?.wtd_pnl" :positive="kpi?.wtd_pnl>0" :negative="kpi?.wtd_pnl<0" />
      <KpiCard title="MTD 盈亏" :value="kpi?.mtd_pnl" :positive="kpi?.mtd_pnl>0" :negative="kpi?.mtd_pnl<0" />
      <KpiCard title="YTD 盈亏" :value="kpi?.ytd_pnl" :positive="kpi?.ytd_pnl>0" :negative="kpi?.ytd_pnl<0" />
    </div>

    <!-- 分割线 -->
    <hr class="divider"/>

    <!-- 持仓明细 -->
    <PositionTable />

    <!-- 分割线 -->
    <hr class="divider"/>

    <!-- 最新交易列表 -->
    <TradeTable />

    <!-- 浮动按钮 -->
    <AddTradeFab class="fab" />

    <FooterBar />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import FooterBar from '@/components/FooterBar.vue'
import KpiCard from '@/components/KpiCard.vue'
import PositionTable from '@/components/PositionTable.vue'
import TradeTable from '@/components/TradeTable.vue'
import AddTradeFab from '@/components/AddTradeFab.vue'
import { useKpi } from '@/services/kpiService'

const { kpi, refresh } = useKpi()

onMounted(()=> {
  // 自动每 60s 刷新 KPI
  setInterval(refresh, 60000)
})
</script>

<style scoped>
.page{display:flex;flex-direction:column;align-items:center;padding-top:48px}
.kpi-row{display:flex;flex-wrap:wrap;justify-content:center;margin:24px auto;max-width:1400px}
.divider{width:90%;max-width:1400px;border:0;border-top:2px dashed rgba(0,255,128,0.7);margin:32px auto}
.fab{position:fixed;right:24px;bottom:96px;padding:10px 20px;border-radius:28px;background:#00ffa2;border:2px solid #00ffa2;color:#000;font-weight:600;transition:background .3s}
.fab:hover{background:#12ffb0}
</style>
