
<template>
  <div class="app">
    <TopBar />
    <main style="
      flex:1;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:flex-start;
      padding-top:40px;
    ">
      <Dashboard />
    </main>
    <FooterBar />
  </div>
</template>

<script setup>
import TopBar from '@/components/TopBar.vue'
import Dashboard from '@/views/Dashboard.vue'
import FooterBar from '@/components/FooterBar.vue'
</script>

<style>
.app{
  min-height:100vh;
  display:flex;
  flex-direction:column;
  background: radial-gradient(circle at center, #002b36, #000);
  color:#00ff99;
}
</style>
