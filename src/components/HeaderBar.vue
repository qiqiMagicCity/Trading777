<template>
  <header class="header">
    <div class="times">
      <div>{{ nyTime }}</div>
      <div>{{ esTime }}</div>
      <div>{{ cnTime }}</div>
    </div>
    <div class="user">
      <span>{{ userName }}</span>
      <button @click="logout">退出</button>
    </div>
  </header>
  <div class="divider"/>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { supabase } from '../supabaseClient.js';
const userName = supabase.auth.user()?.user_metadata.full_name || supabase.auth.user()?.email || 'User';
function formatTZ(offset) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 3600000 * offset).toLocaleString('zh-CN', { hour12: false });
}
const nyTime = ref(''), esTime = ref(''), cnTime = ref('');
function tick() {
  nyTime.value = formatTZ(-4);
  esTime.value = formatTZ(2);
  cnTime.value = formatTZ(8);
}
let timer;
onMounted(() => { tick(); timer = setInterval(tick, 1000); });
onUnmounted(() => clearInterval(timer));
async function logout() {
  await supabase.auth.signOut();
  window.location.href = '#/login';
}
</script>

<style scoped>
.header { display:flex; justify-content:space-between; align-items:center; padding:8px 24px; }
.times>div{ margin-right:16px; }
button { background:transparent; border:1px solid var(--theme-green); color:var(--theme-green); padding:4px 12px; cursor:pointer; }
.divider { border-top:1px solid var(--theme-green); box-shadow:0 0 8px var(--theme-green); margin:16px 0; }
</style>
