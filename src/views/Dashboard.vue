<template>
  <div style="text-align:center;margin-top:4rem;">
    <h2>Dashboard</h2>
    <p>登录会话保持成功！这里将展示后续业务数据。</p>
    <button @click="logout" style="margin-top:1rem;">退出登录</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();

async function logout() {
  const supabase = window.__supabaseClient;
  await supabase.auth.signOut();
  router.push('/login');
}
</script>