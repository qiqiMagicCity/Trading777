
<template>
  <HeaderBar/>
  <main class="home">
    <h1>交易通往财富之路</h1>
    <p>精细化管理 科学 理性 务实</p>
    <div class="btns">
      <button @click="$router.push('/login')">登录</button>
      <button @click="$router.push('/register')">注册</button>
    </div>
  </main>
  <div class="divider"/>
  <footer class="footer">本站功能逐步完善中… © 魔都万事屋™ 2005–2025 • Version v1.2.8</footer>
</template>

<script setup>
import HeaderBar from '../components/HeaderBar.vue';
</script>

<style scoped>
.home{display:flex;flex-direction:column;align-items:center;justify-content:center;height:70vh;text-align:center;}
h1{font-size:48px;margin:0;}
.btns{margin-top:32px;display:flex;gap:24px;}
</style>
