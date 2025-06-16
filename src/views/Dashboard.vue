<template>
  <div class="dashboard">
    <h1>账户总览</h1>
    <div class="summary-cards">
      <div class="card">累计收益：{{ totalPnL }}</div>
      <div class="card">胜率：{{ winRate }}%</div>
    </div>
    <button class="add-btn" @click="openRecord">添加交易</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/supabaseClient';

const router = useRouter();
const totalPnL = ref(0);
const winRate = ref(0);

onMounted(async () => {
  // TODO: 从 Supabase 拉取汇总数据
  // totalPnL.value = ...
  // winRate.value = ...
});

function openRecord() {
  router.push('/record');
}
</script>

<style scoped>
.dashboard { padding: 20px; }
.summary-cards { display: flex; gap: 10px; margin-bottom: 20px; }
.card { background: #000; color: #00ff99; padding: 20px; border-radius: 8px; flex: 1; text-align: center; }
.add-btn { position: fixed; bottom: 20px; right: 20px; background: #00ff99; color: #000; padding: 15px; border: none; border-radius: 50%; font-size: 18px; }
</style>
