<template>
  <section class="p-4">
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="n in 8" :key="n" class="h-24 bg-gray-700/20 rounded-2xl animate-pulse"></div>
    </div>
    <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard v-for="k in kpis" :key="k.label" :kpi="k" />
    </div>
    <p v-if="!loading && !hasData" class="text-center mt-8 text-primary">暂无交易数据</p>

    <AddTradeModal v-model="showModal" @saved="reload" />
    <div class="fixed bottom-10 inset-x-0 flex justify-center">
      <button @click="showModal=true" class="btn btn-primary px-10">添加交易</button>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { fetchKpi } from '../services/kpiService';
import KpiCard from '../components/KpiCard.vue';
import AddTradeModal from '../components/AddTradeModal.vue';

const loading = ref(true);
const kpis = ref([]);
const showModal = ref(false);
const hasData = computed(()=>kpis.value.some(k=>k.value!==0));

async function reload() {
  loading.value = true;
  kpis.value = await fetchKpi();
  loading.value = false;
}
onMounted(reload);
</script>
