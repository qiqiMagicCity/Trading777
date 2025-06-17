<template>
  <div v-if="session" class="dashboard-container">
    <h1>账户总览</h1>
    <div class="summary-cards">
      <div class="card">累计收益：{{ totalPnL }}</div>
      <div class="card">胜率：{{ winRate }}%</div>
    </div>
    <button class="add-btn" @click="openRecord">添加交易</button>
  </div>
  <div class="footer">
    © 魔都万事屋™ 2005 – 2025 版权所有 • 保留所有权利 • MagicCity Global Tec • 版本 0.748
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/supabaseClient';

const router = useRouter();
const session = ref(null);
const totalPnL = ref('--');
const winRate = ref('--');

onMounted(async () => {
  const { data: { session: s } } = await supabase.auth.getSession();
  if (!s) return router.push('/login');
  session.value = s;
});

function openRecord() {
  router.push('/record');
}
</script>

<style scoped>
.dashboard-container {max-width:800px;margin:40px auto;padding:0 20px;}
.summary-cards {display:flex;gap:20px;margin-bottom:20px;}
.card {background:#000;color:#00ff99;padding:20px;border-radius:8px;flex:1;text-align:center;}
.add-btn {position:fixed;bottom:20px;right:20px;background:#00ff99;color:#000;padding:15px;border:none;border-radius:50%;font-size:18px;}
.footer {text-align:center;color:#888;margin-top:20px;font-size:0.9rem;}
</style>
