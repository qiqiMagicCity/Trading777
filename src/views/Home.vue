<template>
  <div class="page">
    <div class="intro">
      <h1>交易通往财富之路</h1>
      <p>精细化管理 科学 理性 务实</p>
    </div>
    <div class="button-group">
      <router-link to="/login"><button class="button-simple">登录</button></router-link>
      <router-link to="/register"><button class="button-simple">注册</button></router-link>
    </div>
  </div>
  <FooterBar />
</template>
<script setup>
import FooterBar from '@/components/FooterBar.vue';
</script>
<style scoped>
.intro { transform: translateY(-15vh); }
h1 { font-size: 5rem; margin-bottom:0.5rem; }
p { font-size:1.3rem; margin-bottom:2rem; transform: translateY(5vh); }
.button-group { display:flex; gap:3cm; margin-bottom:30px; }
</style>
