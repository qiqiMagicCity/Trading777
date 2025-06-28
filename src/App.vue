
<template>
  <div class="container mx-auto p-4">
    <AddTradeModal />
    <div class="border-t-2 border-emerald-400/80 my-4"></div>
    <KpiBoard />
    <div class="border-t-2 border-emerald-400/80 my-4"></div>
    <PositionTable />
    <div class="border-t-2 border-emerald-400/80 my-4"></div>
    <TradeTable />
  </div>
</template>

<script setup>
import AddTradeModal from './components/AddTradeModal.vue'
import KpiBoard from './components/KpiBoard.vue'
import PositionTable from './components/PositionTable.vue'
import TradeTable from './components/TradeTable.vue'
</script>
