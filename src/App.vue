<template>
  <main class="max-w-5xl mx-auto p-4">
    <KPIBoard/>
    <PositionTable/>
    <TradeTable/>
  </main>
</template>

<script setup lang="ts">
import KPIBoard from './components/KPIBoard.vue';
import PositionTable from './components/PositionTable.vue';
import TradeTable from './components/TradeTable.vue';
</script>
